/**
 * Passo 5 – Caccia ai test flaky.
 *
 * Un test flaky è peggio di un test rosso: il team impara a ignorarlo ("rilancia la pipeline")
 * e così smette di fidarsi di tutta la suite. Il flusso:
 *
 *   runner ×N (statistica, niente LLM)
 *      │  test con 0 < successi < N
 *      ▼
 *   flaky-analyst (1 agente per test flaky, in parallelo, sola lettura, JSON)
 *      │
 *      ├─ test_timing → healer (solo tests/, niente cerotti)
 *      ├─ app_race    → bug report
 *      └─ altro       → a una persona
 *      ▼
 *   guardrail sul diff (niente waitForTimeout, retry, skip) + runner ×2N per confermare
 *
 * Uso:  npm run chaos -- slow-cart   (rende il carrello asincrono)
 *       npm run flaky
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ClaudeCodeEngine, type AgentEngine } from './engine.js';
import { runRepeated, type TestStats } from './runner.js';
import { log, mapLimit } from './util.js';

const cwd = resolve(import.meta.dirname, '..');
const engine: AgentEngine = new ClaudeCodeEngine({ cwd, mcpConfig: join(cwd, '.mcp.json') });
const REPEAT = Number(process.env.REPEAT ?? 10);
const MIN_CONFIDENCE = 0.7;

type Category = 'test_timing' | 'app_race' | 'environment' | 'unknown';
interface Diagnosis {
  category: Category;
  confidence: number;
  root_cause: string;
  evidence: string;
  fix: string;
}

const schema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['test_timing', 'app_race', 'environment', 'unknown'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    root_cause: { type: 'string', description: 'Una frase: perché il test è instabile' },
    evidence: { type: 'string', description: 'Righe di codice e osservazioni concrete' },
    fix: { type: 'string', description: 'Correzione strutturale proposta (mai retry/sleep/skip)' },
  },
  required: ['category', 'confidence', 'root_cause', 'evidence', 'fix'],
  additionalProperties: false,
};

/** Pattern che indicano un "cerotto" invece di una correzione vera. */
const BANDAIDS = [/waitForTimeout\s*\(/, /test\.(skip|fixme)\s*\(/, /retries\s*:/, /\.describe\.configure\(\s*\{\s*retries/];

let totalCost = 0;
const pct = (s: TestStats) => `${s.passes}/${s.runs}`;

async function analyse(s: TestStats): Promise<Diagnosis> {
  const prompt = [
    `Test flaky: ${s.title}`,
    `File: tests/${s.file}:${s.line}`,
    `Passato ${s.passes} volte su ${s.runs} esecuzioni identiche.`,
    s.errorContext ? `Snapshot della pagina in un'esecuzione fallita: ${s.errorContext}` : '',
    `Errori distinti osservati:\n${s.errors.map((e, i) => `--- ${i + 1}\n${e}`).join('\n')}`,
  ].join('\n');
  try {
    const res = await engine.run<Diagnosis>({
      agent: 'flaky-analyst',
      prompt,
      allowedTools: ['Read', 'Glob', 'Grep', 'LS'],
      disallowedTools: ['Read(chaos/**)'],
      jsonSchema: schema,
    });
    totalCost += res.costUsd;
    if (!res.data) throw new Error('risposta senza JSON');
    return res.data;
  } catch (e) {
    return { category: 'unknown', confidence: 0, root_cause: 'Analisi fallita', evidence: String(e).slice(0, 300), fix: '' };
  }
}

async function heal(items: { s: TestStats; d: Diagnosis }[]): Promise<string> {
  const list = items
    .map(({ s, d }) => `- tests/${s.file}:${s.line} "${s.title}" (passa ${pct(s)})\n  Causa: ${d.root_cause}\n  Fix proposto: ${d.fix}`)
    .join('\n');
  const res = await engine.run({
    agent: 'playwright-test-healer',
    prompt:
      `Questi test sono FLAKY (a volte passano, a volte no). L'app è corretta: la causa è nel test.\n${list}\n\n` +
      'Rendi i test deterministici con asserzioni web-first che riprovano automaticamente. ' +
      'VIETATO: waitForTimeout, aumentare retry o timeout, test.skip/fixme. Modifica solo file in tests/. ' +
      'Alla fine elenca in italiano cosa hai cambiato.',
    allowedTools: ['mcp__playwright-test', 'Read', 'Glob', 'Grep', 'LS', 'Edit(tests/**)'],
    disallowedTools: ['Read(chaos/**)'],
  });
  totalCost += res.costUsd;
  return res.text;
}

async function main() {
  const reportDir = join(cwd, 'reports', `flaky-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(reportDir, { recursive: true });
  const started = Date.now();

  log(`▶ Runner: ogni test ×${REPEAT}`);
  const before = runRepeated(cwd, REPEAT);
  const flaky = before.filter((s) => s.passes > 0 && s.passes < s.runs);
  const alwaysRed = before.filter((s) => s.runs > 0 && s.passes === 0);
  for (const s of before) log(`  ${s.passes === s.runs ? '✅' : s.passes === 0 ? '❌' : '🎲'} ${pct(s)}  ${s.title}`);
  if (alwaysRed.length) log(`  (${alwaysRed.length} test sempre rossi: non sono flaky, li gestisce \`npm run orchestrate\`)`);
  if (!flaky.length) return log('✅ Nessun test flaky.');

  log(`▶ Analisi: ${flaky.length} test flaky`);
  const diagnoses = await mapLimit(flaky, 3, async (s) => {
    const d = await analyse(s);
    log(`  [${d.category} ${Math.round(d.confidence * 100)}%] ${s.title}: ${d.root_cause}`);
    return { s, d };
  });

  const sure = diagnoses.filter(({ d }) => d.confidence >= MIN_CONFIDENCE);
  const toHeal = sure.filter(({ d }) => d.category === 'test_timing');
  const appRaces = sure.filter(({ d }) => d.category === 'app_race');

  for (const { s, d } of appRaces) {
    writeFileSync(
      join(reportDir, `race-${s.id.slice(0, 8)}.md`),
      `# 🎲 ${d.root_cause}\n\n- **Test:** \`tests/${s.file}:${s.line}\` – passa ${pct(s)}\n\n## Prove\n${d.evidence}\n\n## Fix proposto\n${d.fix}\n`,
    );
  }

  let healerNotes = '';
  if (toHeal.length) {
    log(`▶ Healer: stabilizzo ${toHeal.length} test`);
    healerNotes = await heal(toHeal);
  }

  // ---------- Guardrail 1: il diff non deve contenere cerotti ----------
  const warnings: string[] = [];
  const diff = execSync('git diff -U0 -- tests', { cwd }).toString();
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  for (const line of added)
    if (BANDAIDS.some((re) => re.test(line))) warnings.push(`Cerotto aggiunto dall'healer: \`${line.slice(1).trim()}\``);

  // ---------- Guardrail 2: conferma statistica con il doppio delle esecuzioni ----------
  let after: TestStats[] = [];
  if (toHeal.length) {
    log(`▶ Verifica: ogni test ×${REPEAT * 2}`);
    after = runRepeated(cwd, REPEAT * 2);
  }
  const statAfter = (id: string) => after.find((a) => a.id === id);
  for (const { s } of toHeal) {
    const a = statAfter(s.id);
    if (!a || a.passes < a.runs) warnings.push(`"${s.title}" non è stabile dopo la correzione (${a ? pct(a) : 'non eseguito'}).`);
  }
  const newlyFlaky = after.filter((a) => a.passes < a.runs && !flaky.some((f) => f.id === a.id) && !alwaysRed.some((r) => r.id === a.id));
  for (const a of newlyFlaky) warnings.push(`"${a.title}" è diventato instabile dopo la correzione (${pct(a)}).`);

  const rows = diagnoses
    .map(({ s, d }) => {
      const a = statAfter(s.id);
      return `| ${s.title} | ${pct(s)} | \`${d.category}\` ${Math.round(d.confidence * 100)}% | ${a ? pct(a) : '—'} | ${d.root_cause.replace(/\|/g, '/')} |`;
    })
    .join('\n');

  const report = `# Report test flaky

- **Esecuzioni per test:** ${REPEAT} (verifica: ${REPEAT * 2})
- **Test flaky trovati:** ${flaky.length} su ${before.length}
- **Durata:** ${Math.round((Date.now() - started) / 1000)} s · **Costo LLM stimato:** $${totalCost.toFixed(2)}

${warnings.map((w) => `> ⚠️ ${w}`).join('\n') || '> ✅ Nessun guardrail violato: nessun cerotto, test stabili alla verifica.'}

| Test | Prima | Diagnosi | Dopo | Causa |
|---|---|---|---|---|
${rows}

## Diagnosi dettagliate
${diagnoses.map(({ s, d }) => `### ${s.title}\n**Prove:** ${d.evidence}\n\n**Fix proposto:** ${d.fix}`).join('\n\n')}

## Note dell'healer
${healerNotes || '_nessun intervento_'}

## Diff dei test
\`\`\`diff
${diff || '(nessuna modifica)'}
\`\`\`
`;
  writeFileSync(join(reportDir, 'report.md'), report);
  log(`📄 Report: ${join(reportDir, 'report.md')} (costo ~$${totalCost.toFixed(2)})`);
  warnings.forEach((w) => log(`⚠️ ${w}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
