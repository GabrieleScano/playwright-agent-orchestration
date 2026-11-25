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
import { BudgetedEngine, BudgetExceededError, ClaudeCodeEngine } from './engine.js';
import { runTests, where, type Failure, type RunSummary } from './runner.js';
import { log, mapLimit } from './util.js';

const cwd = resolve(import.meta.dirname, '..');

// ---------- Controllo dei costi (Passo 6) ----------
/** Tetto di spesa per esecuzione: oltre, gli agenti non vengono più chiamati. */
const BUDGET_USD = Number(process.env.AGENT_BUDGET_USD ?? 1);
/** Il triage è un compito di classificazione: basta un modello piccolo ed economico. */
const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? 'haiku';
/** L'healer deve navigare, debuggare e modificare codice: serve un modello più capace. */
const HEAL_MODEL = process.env.HEAL_MODEL ?? 'sonnet';
/** Oltre questa soglia il problema è quasi sempre sistemico (app giù, ambiente rotto): niente agenti. */
const MAX_FAILURES = Number(process.env.MAX_FAILURES ?? 10);

const engine = new BudgetedEngine(new ClaudeCodeEngine({ cwd, mcpConfig: join(cwd, '.mcp.json') }), BUDGET_USD);
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

// ---------- 1. Triage: un agente per fallimento, in parallelo (sola lettura) ----------
async function triage(f: Failure): Promise<Verdict> {
  const prompt = [
    'Classifica questo test fallito.',
    `Test: ${f.title}`,
    `File: ${where(f)}`,
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
      model: TRIAGE_MODEL,
    });
    if (!res.data) throw new Error('risposta senza JSON');
    return res.data;
  } catch (e) {
    const summary = e instanceof BudgetExceededError ? `${e.message}: decide una persona` : 'Triage fallito';
    return { category: 'unknown', confidence: 0, summary, evidence: String(e).slice(0, 300), suggested_fix: '' };
  }
}

// ---------- 2. Healer: UNA sola istanza per tutti i test fragili (scrive file) ----------
async function heal(items: { f: Failure; v: Verdict }[]): Promise<string> {
  const list = items
    .map(({ f, v }) => `- ${where(f)} "${f.title}"\n  Diagnosi del triage: ${v.summary}\n  Fix suggerito: ${v.suggested_fix}`)
    .join('\n');
  const res = await engine.run({
    agent: 'playwright-test-healer',
    prompt:
      `Ripara SOLO questi test, già diagnosticati come test fragili (l'app è corretta):\n${list}\n\n` +
      "Non cambiare le asserzioni sui valori mostrati all'utente. Modifica solo file in tests/ e features/steps/. " +
      // BDD: il .feature è il requisito (il COSA), le step definitions sono il COME.
      'Per gli scenari BDD correggi SOLO le step definitions in features/steps/: i file .feature sono i requisiti ' +
      'concordati con il business e NON vanno mai modificati. ' +
      // Decidere che un test rileva un bug è compito del triage, non dell'healer:
      'NON usare test.fixme, test.skip o simili: se dopo la tua correzione il test fallisce per un altro motivo, ' +
      "lascialo fallire e descrivi il motivo. L'orchestratore farà un nuovo triage. " +
      'Alla fine elenca in italiano cosa hai cambiato.',
    allowedTools: ['mcp__playwright-test', 'Read', 'Glob', 'Grep', 'LS', 'Edit(tests/**)', 'Edit(features/steps/**)'],
    disallowedTools: ['Read(chaos/**)', 'Edit(features/**/*.feature)'],
    model: HEAL_MODEL,
  });
  return res.text;
}

// ---------- Guardrail BDD: i .feature sono i requisiti, gli agenti non li toccano ----------
/**
 * Il permesso `Edit(features/**\/*.feature)` è già negato all'healer, ma non ci fidiamo solo dei permessi:
 * dopo ogni intervento controlliamo il diff e annulliamo qualsiasi modifica a un .feature.
 * Cambiare un requisito è una decisione di business, non una riparazione.
 */
function protectFeatureFiles(): string[] {
  const changed = execSync("git diff --name-only -- 'features/*.feature' 'features/**/*.feature'", { cwd })
    .toString()
    .split('\n')
    .filter(Boolean);
  for (const file of changed) {
    execSync(`git checkout -- "${file}"`, { cwd });
    log(`  🛡️ Annullata la modifica a ${file}: i requisiti non si toccano`);
  }
  return changed.map((file) => `L'healer ha provato a modificare il requisito \`${file}\`: modifica annullata.`);
}

// ---------- 3. Bug report: deterministico, nessun LLM necessario ----------
function writeBugReport(dir: string, f: Failure, v: Verdict): string {
  const name = `bug-${f.id}.md`;
  writeFileSync(
    join(dir, name),
    `# 🐞 ${v.summary}\n\n- **Test che lo rileva:** \`${where(f)}\` – ${f.title}\n` +
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
  if (first.failed === 0) return finish(reportDir, '# Report orchestratore\n\n✅ Tutto verde: nessun agente chiamato, costo $0.\n');

  // Interruttore di sicurezza: con troppi rossi il problema è quasi sempre sistemico
  // (app giù, deploy rotto, ambiente). Lanciare un agente per test sarebbe solo costoso.
  if (first.failed > MAX_FAILURES) {
    log(`⛔ ${first.failed} test falliti (soglia ${MAX_FAILURES}): probabile problema sistemico, niente agenti.`);
    return finish(
      reportDir,
      `# Report orchestratore\n\n> ⛔ **${first.failed} test falliti su ${first.passed + first.failed}**, oltre la soglia di ${MAX_FAILURES}.\n` +
        `> Probabile problema sistemico (app non raggiungibile, deploy rotto, ambiente): nessun agente chiamato, costo $0.\n\n` +
        `## Primi errori\n${first.failures.slice(0, 5).map((f) => `- **${f.title}**: ${f.error.split('\n')[0]}`).join('\n')}\n`,
    );
  }

  const history: Entry[] = [];
  const bugIds = new Set<string>(); // test che rilevano un bug: devono restare rossi
  const humanIds = new Set<string>(); // test lasciati a una persona
  const healerNotes: string[] = [];
  const specViolations: string[] = []; // modifiche (annullate) ai .feature
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
      try {
        healerNotes.push(`### Giro ${round}\n${await heal(toHeal)}`);
        specViolations.push(...protectFeatureFiles());
      } catch (e) {
        // Budget esaurito o agente fallito: i test restano rossi e senza diagnosi, il guardrail lo segnala.
        healerNotes.push(`### Giro ${round}\n⚠️ Healer non eseguito: ${(e as Error).message.split('\n')[0]}`);
        break;
      }
    } else if (!verdicts.some((e) => e.v.category === 'environment')) {
      break; // niente da riparare né da riprovare: inutile rieseguire
    }

    log('▶ Runner: riesecuzione');
    current = runTests(cwd);
    log(`  ${current.passed} passati, ${current.failed} falliti, ${current.skipped} saltati`);
  }

  // ---------- Guardrail finali ----------
  const stillFailing = new Set(current.failures.map((f) => f.id));
  const warnings: string[] = [...specViolations];
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
- **Durata:** ${Math.round((Date.now() - started) / 1000)} s · **Costo LLM:** $${engine.spent.toFixed(3)} (budget $${BUDGET_USD.toFixed(2)})

${warnings.map((w) => `> ⚠️ ${w}`).join('\n') || '> ✅ Nessun guardrail violato.'}

| Giro | Test | Triage | Confidenza | Esito | Diagnosi |
|---|---|---|---|---|---|
${rows}

## Bug dell'app
${bugIds.size ? `${bugIds.size} bug report in questa cartella (bug-*.md). I test relativi restano rossi finché l'app non viene corretta.` : 'Nessuno.'}

## Costi per agente
${engine.costTable()}

## Note dell'healer
${healerNotes.join('\n\n') || '_nessun intervento_'}
`;
  finish(reportDir, report);
  warnings.forEach((w) => log(`⚠️ ${w}`));
}

/** Scrive il report nella cartella dell'esecuzione e in reports/latest.md (comodo in CI). */
function finish(reportDir: string, report: string) {
  writeFileSync(join(reportDir, 'report.md'), report);
  writeFileSync(join(cwd, 'reports', 'latest.md'), report);
  log(`📄 Report: ${join(reportDir, 'report.md')} (costo $${engine.spent.toFixed(3)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
