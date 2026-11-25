/**
 * Passo 7 – Dal requisito al test verde, in BDD.
 *
 *   bdd-planner   (esplora l'app, scrive UN nuovo .feature in italiano, riusa le frasi esistenti)
 *      │  guardrail: nessun .feature esistente modificato, niente dettagli tecnici nel Gherkin
 *      ▼
 *   bddgen        (deterministico: quali frasi non hanno ancora una step definition?)
 *      │  se mancano step
 *      ▼
 *   bdd-generator (implementa SOLO gli step mancanti in features/steps/, verifica i locator nel browser)
 *      │  guardrail: .feature intatti, nessun cerotto, bddgen senza step mancanti
 *      ▼
 *   runner        (esegue tutta la suite: i nuovi scenari rossi sono possibili bug, NON si adattano)
 *
 * Uso:  npm run bdd -- "catalogo prodotti: nomi e prezzi"
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BudgetedEngine, ClaudeCodeEngine } from './engine.js';
import { runTests } from './runner.js';
import { log } from './util.js';

const cwd = resolve(import.meta.dirname, '..');
const BUDGET_USD = Number(process.env.AGENT_BUDGET_USD ?? 2);
const MODEL = process.env.BDD_MODEL ?? 'sonnet';
const engine = new BudgetedEngine(new ClaudeCodeEngine({ cwd, mcpConfig: join(cwd, '.mcp.json') }), BUDGET_USD);
const topic = process.argv.slice(2).join(' ').trim() || 'il catalogo dei prodotti: nomi e prezzi mostrati';

/** Nel Gherkin si parla la lingua del business: questi pattern indicano dettagli tecnici. */
const TECHNICAL = [/data-testid/i, /getBy\w+/, /\bcss\b/i, /\bselettore\b/i, /\b\d+\s?ms\b/, /localhost|https?:\/\//, /[#.][a-z-]+\s*\{/];
const BANDAIDS = [/waitForTimeout\s*\(/, /test\.(skip|fixme)\s*\(/, /retries\s*:/];

/** Copia dell'app per esplorare con browser_navigate: porta diversa da quella dei test, così non si scontrano. */
const EXPLORE_PORT = String(Number(process.env.PORT ?? 4310) + 1);
const EXPLORE_URL = `http://localhost:${EXPLORE_PORT}`;

const sh = (cmd: string) => execSync(cmd, { cwd }).toString().trim();
const lines = (s: string) => s.split('\n').filter(Boolean);

/** bddgen è il "compilatore" del BDD: ci dice in modo deterministico quali frasi non hanno uno step. */
function missingSteps(): { ok: boolean; output: string } {
  const r = spawnSync('npx', ['bddgen'], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, output: (r.stdout + r.stderr).trim() };
}

async function main() {
  const reportDir = join(cwd, 'reports', `bdd-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(reportDir, { recursive: true });
  const started = Date.now();
  const warnings: string[] = [];
  const app = spawn('node', ['demo-app/server.mjs'], { cwd, env: { ...process.env, PORT: EXPLORE_PORT }, stdio: 'ignore' });
  process.on('exit', () => app.kill());
  const featuresBefore = new Set(lines(sh('git ls-files features')).filter((f) => f.endsWith('.feature')));

  // ---------- 1. Planner: il COSA ----------
  log(`▶ bdd-planner: "${topic}"`);
  const planner = await engine.run({
    agent: 'bdd-planner',
    prompt:
      `Scrivi UN nuovo file .feature in features/ per questa funzionalità del Mini Shop: ${topic}.\n` +
      `L'app è in esecuzione su ${EXPLORE_URL}: usa planner_setup_page, poi esplora con browser_navigate. Riusa alla lettera le frasi esistenti. ` +
      'Al massimo 4 scenari, almeno uno negativo o di confine.',
    // Le regole Edit(...) valgono per tutti i tool che scrivono file (Write compreso).
    // Che il planner crei solo file NUOVI lo verifica il codice qui sotto con git.
    allowedTools: ['mcp__playwright-test', 'Read', 'Glob', 'Grep', 'LS', 'Edit(features/*.feature)'],
    disallowedTools: ['Read(chaos/**)', 'Edit(features/steps/**)'],
    model: MODEL,
  });

  // Guardrail: il planner crea, non modifica.
  for (const f of lines(sh('git diff --name-only -- features'))) {
    warnings.push(`Il planner ha modificato \`${f}\`: ripristinato.`);
    sh(`git checkout -- "${f}"`);
  }
  const newFeatures = lines(sh('git ls-files --others --exclude-standard features')).filter(
    (f) => f.endsWith('.feature') && !featuresBefore.has(f),
  );
  if (!newFeatures.length) throw new Error(`Il planner non ha scritto nessun .feature.\n${planner.text}`);
  const gherkin = newFeatures.map((f) => sh(`cat "${f}"`)).join('\n');
  for (const re of TECHNICAL) if (re.test(gherkin)) warnings.push(`Dettaglio tecnico nel Gherkin (${re}): il requisito deve parlare la lingua del business.`);
  log(`  ✍️  ${newFeatures.join(', ')}`);

  // ---------- 2. bddgen: cosa manca? ----------
  const gap = missingSteps();
  const missingCount = Number(gap.output.match(/Missing step definitions: (\d+)/)?.[1] ?? 0);
  log(gap.ok ? '  ♻️  Tutte le frasi esistono già: nessuno step da scrivere' : `  🧩 Step mancanti: ${missingCount}`);

  // ---------- 3. Generator: il COME ----------
  let generator = '';
  if (!gap.ok) {
    log('▶ bdd-generator: implemento gli step mancanti');
    const res = await engine.run({
      agent: 'bdd-generator',
      prompt:
        `Implementa le step definitions mancanti per ${newFeatures.join(', ')}.\n` +
        `Output di bddgen:\n${gap.output}\n\n` +
        `Per verificare i locator apri l'app su ${EXPLORE_URL}. ` +
        'Riusa `ui` e `login` di features/steps/minishop.steps.ts. Non toccare i file .feature.',
      allowedTools: [
        'mcp__playwright-test', 'Read', 'Glob', 'Grep', 'LS',
        'Edit(features/steps/**)', 'Bash(npx bddgen)',
      ],
      disallowedTools: ['Read(chaos/**)', 'Edit(features/**/*.feature)'],
      model: MODEL,
    });
    generator = res.text;
  }

  // ---------- 4. Guardrail sul lavoro del generator ----------
  const changed = lines(sh('git status --porcelain -- features')).map((l) => l.slice(3));
  for (const f of changed.filter((f) => f.endsWith('.feature') && !newFeatures.includes(f))) {
    warnings.push(`Il generator ha toccato il requisito \`${f}\`: ripristinato.`);
    sh(`git checkout -- "${f}"`);
  }
  const stepDiff = sh('git diff -U0 -- features/steps') + '\n' +
    lines(sh('git ls-files --others --exclude-standard features/steps')).map((f) => sh(`cat "${f}"`).replace(/^/gm, '+')).join('\n');
  for (const l of stepDiff.split('\n').filter((l) => l.startsWith('+')))
    if (BANDAIDS.some((re) => re.test(l))) warnings.push(`Cerotto nello step: \`${l.slice(1).trim()}\``);
  const after = missingSteps();
  if (!after.ok) warnings.push(`Restano step mancanti:\n\`\`\`\n${after.output.slice(0, 800)}\n\`\`\``);

  // ---------- 5. Runner: verità deterministica ----------
  app.kill();
  log('▶ Runner: tutta la suite');
  const run = after.ok ? runTests(cwd) : undefined;
  const newReds = run?.failures.filter((f) => newFeatures.includes(f.file)) ?? [];
  const oldReds = run?.failures.filter((f) => !newFeatures.includes(f.file)) ?? [];
  if (oldReds.length) warnings.push(`${oldReds.length} scenari che prima erano verdi ora sono rossi.`);
  if (run) log(`  ${run.passed} passati, ${run.failed} falliti`);

  const report = `# Report BDD: dal requisito al test

- **Funzionalità richiesta:** ${topic}
- **Nuovi .feature:** ${newFeatures.map((f) => `\`${f}\``).join(', ')}
- **Step mancanti dopo il planner:** ${missingCount} · **dopo il generator:** ${after.ok ? 0 : 'alcuni (vedi sotto)'}
- **Suite:** ${run ? `${run.passed} passati, ${run.failed} falliti` : 'non eseguita'}
- **Durata:** ${Math.round((Date.now() - started) / 1000)} s · **Costo LLM:** $${engine.spent.toFixed(3)} (budget $${BUDGET_USD.toFixed(2)})

${warnings.map((w) => `> ⚠️ ${w}`).join('\n') || '> ✅ Nessun guardrail violato.'}

${newReds.length ? `## Scenari nuovi rossi (possibili bug o requisito da chiarire: decide una persona)\n${newReds.map((f) => `- **${f.title}**\n  \`\`\`\n  ${f.error.split('\n').slice(0, 4).join('\n  ')}\n  \`\`\``).join('\n')}\n` : ''}
## Il requisito scritto dal planner
\`\`\`gherkin
${gherkin}
\`\`\`

## Step definitions aggiunte dal generator
\`\`\`diff
${stepDiff.trim() || '(nessuna: tutte le frasi erano già implementate)'}
\`\`\`

## Costi per agente
${engine.costTable()}

## Note del planner
${planner.text}

## Note del generator
${generator || '_non necessario_'}
`;
  writeFileSync(join(reportDir, 'report.md'), report);
  writeFileSync(join(cwd, 'reports', 'latest-bdd.md'), report);
  log(`📄 Report: ${join(reportDir, 'report.md')} (costo $${engine.spent.toFixed(3)})`);
  warnings.forEach((w) => log(`⚠️ ${w}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
