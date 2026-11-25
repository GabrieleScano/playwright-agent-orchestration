/**
 * Passo 4 – L'orchestratore.
 *
 *   ┌────────┐   fallimenti   ┌──────────────────┐  verdetti  ┌────────┐
 *   │ runner │ ─────────────▶ │ triage (N agenti │ ─────────▶ │ router │
 *   └────────┘                │  in parallelo)   │            └───┬────┘
 *                             └──────────────────┘                │
 *         ┌───────────────────────────┬───────────────────────────┼──────────────────┐
 *         ▼                           ▼                           ▼                  ▼
 *   broken_test → healer      app_bug → bug report      environment → retry   unknown → umano
 *         └──────────────┬────────────┘
 *                        ▼
 *              runner (verifica) → report finale
 *
 * Le decisioni "chi fa cosa" sono CODICE, non prompt: sono le regole (guardrail)
 * che rendono il sistema prevedibile. Gli LLM lavorano solo dentro il loro ruolo.
 *
 * Uso:  npm run chaos -- rename-button,price-bug   (simula un commit che cambia l'app)
 *       npm run orchestrate
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ClaudeCodeEngine, type AgentEngine } from './engine.js';
import { runTests, type Failure, type RunSummary } from './runner.js';
import { log, mapLimit } from './util.js';

const cwd = resolve(import.meta.dirname, '..');
const engine: AgentEngine = new ClaudeCodeEngine({ cwd, mcpConfig: join(cwd, '.mcp.json') });
const MIN_CONFIDENCE = 0.7;
const MAX_PARALLEL = 3;

type Category = 'broken_test' | 'app_bug' | 'environment' | 'unknown';
interface Verdict {
  category: Category;
  confidence: number;
  summary: string;
  evidence: string;
  suggested_fix: string;
}

const verdictSchema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['broken_test', 'app_bug', 'environment', 'unknown'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    summary: { type: 'string', description: 'Una frase: cosa è successo' },
    evidence: { type: 'string', description: 'Prove concrete: righe di codice, testo dello snapshot' },
    suggested_fix: { type: 'string', description: 'Cosa andrebbe cambiato e dove (test o app)' },
  },
  required: ['category', 'confidence', 'summary', 'evidence', 'suggested_fix'],
  additionalProperties: false,
};

let totalCost = 0;

// ---------- 1. Triage: un agente per fallimento, in parallelo (sola lettura) ----------
async function triage(f: Failure): Promise<Verdict> {
  const prompt = [
    'Classifica questo test fallito.',
    `Test: ${f.title}`,
    `File: tests/${f.file}:${f.line}`,
    f.errorContext ? `Snapshot della pagina al fallimento: ${f.errorContext}` : '',
    `Errore:\n${f.error}`,
  ].join('\n');
  try {
    const res = await engine.run<Verdict>({
      agent: 'failure-triage',
      prompt,
      allowedTools: ['Read', 'Glob', 'Grep', 'LS'],
      // Il triage deve giudicare "alla cieca": non può sapere quali mutazioni abbiamo iniettato.
      disallowedTools: ['Read(chaos/**)'],
      jsonSchema: verdictSchema,
    });
    totalCost += res.costUsd;
    if (!res.data) throw new Error('risposta senza JSON');
    return res.data;
  } catch (e) {
    return { category: 'unknown', confidence: 0, summary: 'Triage fallito', evidence: String(e).slice(0, 300), suggested_fix: '' };
  }
}

// ---------- 2. Healer: UNA sola istanza per tutti i test fragili (scrive file) ----------
async function heal(items: { f: Failure; v: Verdict }[]): Promise<string> {
  const list = items
    .map(({ f, v }) => `- tests/${f.file}:${f.line} "${f.title}"\n  Diagnosi del triage: ${v.summary}\n  Fix suggerito: ${v.suggested_fix}`)
    .join('\n');
  const res = await engine.run({
    agent: 'playwright-test-healer',
    prompt:
      `Ripara SOLO questi test, già diagnosticati come test fragili (l'app è corretta):\n${list}\n\n` +
      "Non cambiare le asserzioni sui valori mostrati all'utente. Modifica solo file in tests/. " +
      // Decidere che un test rileva un bug è compito del triage, non dell'healer:
      'NON usare test.fixme, test.skip o simili: se dopo la tua correzione il test fallisce per un altro motivo, ' +
      "lascialo fallire e descrivi il motivo. L'orchestratore farà un nuovo triage. " +
      'Alla fine elenca in italiano cosa hai cambiato.',
    allowedTools: ['mcp__playwright-test', 'Read', 'Glob', 'Grep', 'LS', 'Edit(tests/**)'],
    disallowedTools: ['Read(chaos/**)'],
  });
  totalCost += res.costUsd;
  return res.text;
}

// ---------- 3. Bug report: deterministico, nessun LLM necessario ----------
function writeBugReport(dir: string, f: Failure, v: Verdict): string {
  const name = `bug-${f.id.slice(0, 8)}.md`;
  writeFileSync(
    join(dir, name),
    `# 🐞 ${v.summary}\n\n- **Test che lo rileva:** \`tests/${f.file}:${f.line}\` – ${f.title}\n` +
      `- **Confidenza del triage:** ${Math.round(v.confidence * 100)}%\n\n## Prove\n${v.evidence}\n\n` +
      `## Fix suggerito\n${v.suggested_fix}\n\n## Errore originale\n\`\`\`\n${f.error}\n\`\`\`\n`,
  );
  return name;
}

// ---------- Il flusso principale: un loop, non una pipeline lineare ----------
/**
 * Perché un loop? Un fallimento può NASCONDERNE un altro: se il login è rotto, il test
 * si ferma lì e non arriva mai all'asserzione sul totale. Solo dopo aver riparato il login
 * emerge il bug vero. Quindi: esegui → triage → agisci → riesegui, finché non resta niente
 * da fare (o si raggiunge MAX_ROUNDS).
 */
const MAX_ROUNDS = 3;
type Entry = { round: number; f: Failure; v: Verdict };

async function main() {
  const reportDir = join(cwd, 'reports', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(reportDir, { recursive: true });
  const started = Date.now();
  const appChanges = execSync('git diff --stat -- demo-app', { cwd }).toString().trim();

  log(`▶ Runner: eseguo la suite${appChanges ? " (app modificata rispetto all'ultimo commit)" : ''}`);
  const first = runTests(cwd);
  log(`  ${first.passed} passati, ${first.failed} falliti, ${first.skipped} saltati`);
  if (first.failed === 0) return log('✅ Tutto verde, nessun agente necessario.');

  const history: Entry[] = [];
  const bugIds = new Set<string>(); // test che rilevano un bug: devono restare rossi
  const humanIds = new Set<string>(); // test lasciati a una persona
  const healerNotes: string[] = [];
  let current: RunSummary = first;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // Rivaluta solo i fallimenti che non hanno già un verdetto definitivo.
    const pending = current.failures.filter((f) => !bugIds.has(f.id) && !humanIds.has(f.id));
    if (!pending.length) break;

    log(`━━ Giro ${round}: triage di ${pending.length} fallimenti (max ${MAX_PARALLEL} in parallelo)`);
    const verdicts = await mapLimit(pending, MAX_PARALLEL, async (f) => {
      const v = await triage(f);
      log(`  [${v.category} ${Math.round(v.confidence * 100)}%] ${f.title}`);
      return { round, f, v };
    });
    history.push(...verdicts);

    // Router: regole esplicite, scritte in codice.
    const sure = (e: Entry) => e.v.confidence >= MIN_CONFIDENCE;
    const toHeal = verdicts.filter((e) => sure(e) && e.v.category === 'broken_test');
    for (const e of verdicts) {
      if (sure(e) && e.v.category === 'app_bug') {
        bugIds.add(e.f.id);
        log(`  🐞 Bug report: ${writeBugReport(reportDir, e.f, e.v)}`);
      } else if (!sure(e) || e.v.category === 'unknown') {
        humanIds.add(e.f.id);
      }
      // environment: nessuna azione, verrà semplicemente rieseguito al prossimo giro.
    }

    if (toHeal.length) {
      log(`▶ Healer: riparo ${toHeal.length} test fragili`);
      healerNotes.push(`### Giro ${round}\n${await heal(toHeal)}`);
    } else if (!verdicts.some((e) => e.v.category === 'environment')) {
      break; // niente da riparare né da riprovare: inutile rieseguire
    }

    log('▶ Runner: riesecuzione');
    current = runTests(cwd);
    log(`  ${current.passed} passati, ${current.failed} falliti, ${current.skipped} saltati`);
  }

  // ---------- Guardrail finali ----------
  const stillFailing = new Set(current.failures.map((f) => f.id));
  const warnings: string[] = [];
  const hiddenBugs = [...bugIds].filter((id) => !stillFailing.has(id));
  if (hiddenBugs.length) warnings.push(`${hiddenBugs.length} test che rilevano un bug sono diventati verdi: qualcuno ha nascosto il bug?`);
  if (current.skipped > first.skipped)
    warnings.push(`I test saltati sono passati da ${first.skipped} a ${current.skipped}: un test saltato è un rosso nascosto.`);
  const unexplained = current.failures.filter((f) => !bugIds.has(f.id) && !humanIds.has(f.id));
  if (unexplained.length) warnings.push(`${unexplained.length} test ancora rossi senza diagnosi dopo ${MAX_ROUNDS} giri.`);

  // L'ultimo verdetto per ogni test è quello che conta.
  const lastVerdict = new Map<string, Entry>();
  for (const e of history) lastVerdict.set(e.f.id, e);
  const outcome = (e: Entry) => {
    const red = stillFailing.has(e.f.id);
    if (e.v.category === 'app_bug') return red ? '🐞 resta rosso (corretto)' : '⚠️ è diventato verde!';
    if (humanIds.has(e.f.id)) return red ? '🙋 a una persona' : '✅ verde';
    return red ? '❌ ancora rosso' : '✅ verde';
  };
  const rows = history
    .map((e) => {
      const isLast = lastVerdict.get(e.f.id) === e;
      return `| ${e.round} | ${e.f.title} | \`${e.v.category}\` | ${Math.round(e.v.confidence * 100)}% | ${isLast ? outcome(e) : '↪ rivalutato'} | ${e.v.summary.replace(/\|/g, '/')} |`;
    })
    .join('\n');

  const report = `# Report orchestratore

- **Modifiche all'app non committate:** ${appChanges ? '\n```\n' + appChanges + '\n```' : 'nessuna'}
- **Prima:** ${first.passed} passati, ${first.failed} falliti, ${first.skipped} saltati
- **Dopo:** ${current.passed} passati, ${current.failed} falliti, ${current.skipped} saltati
- **Durata:** ${Math.round((Date.now() - started) / 1000)} s · **Costo LLM stimato:** $${totalCost.toFixed(2)}

${warnings.map((w) => `> ⚠️ ${w}`).join('\n') || '> ✅ Nessun guardrail violato.'}

| Giro | Test | Triage | Confidenza | Esito | Diagnosi |
|---|---|---|---|---|---|
${rows}

## Bug dell'app
${bugIds.size ? `${bugIds.size} bug report in questa cartella (bug-*.md). I test relativi restano rossi finché l'app non viene corretta.` : 'Nessuno.'}

## Note dell'healer
${healerNotes.join('\n\n') || '_nessun intervento_'}
`;
  writeFileSync(join(reportDir, 'report.md'), report);
  log(`📄 Report: ${join(reportDir, 'report.md')} (costo ~$${totalCost.toFixed(2)})`);
  warnings.forEach((w) => log(`⚠️ ${w}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
