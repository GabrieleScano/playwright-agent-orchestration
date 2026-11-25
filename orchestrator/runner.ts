/**
 * Runner deterministico: esegue Playwright e restituisce i fallimenti in forma strutturata.
 * NON è un agente: eseguire i test non richiede "intelligenza", e tenerlo fuori dall'LLM
 * lo rende veloce, gratuito e ripetibile.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface Failure {
  id: string;
  title: string;
  /** Percorso dal root del repo: tests/... per i test classici, features/....feature per gli scenari BDD. */
  file: string;
  kind: TestKind;
  line: number;
  error: string;
  errorContext?: string; // percorso di error-context.md (snapshot della pagina al fallimento)
}

export interface RunSummary {
  passed: number;
  failed: number;
  skipped: number;
  failures: Failure[];
}

interface JsonSuite {
  title: string;
  file: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}
interface JsonSpec {
  id: string;
  title: string;
  file: string;
  line: number;
  tests: { status: string; results: { status: string; error?: { message?: string }; attachments?: { name: string; path?: string }[] }[] }[];
}

export type TestKind = 'classic' | 'bdd';

/**
 * Gli scenari BDD girano come file generati in .features-gen/: per gli agenti (e per noi)
 * conta il file .feature da cui nascono, non il codice generato.
 */
function locate(specFile: string): { file: string; kind: TestKind } {
  if (specFile.startsWith('.features-gen/')) {
    return { file: specFile.replace(/^\.features-gen\//, '').replace(/\.spec\.js$/, ''), kind: 'bdd' };
  }
  return { file: `tests/${specFile}`, kind: 'classic' };
}

/** Rigenera i test dai .feature: va fatto prima di ogni esecuzione. */
function bddgen(cwd: string) {
  const r = spawnSync('npx', ['bddgen'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`bddgen fallito (step mancanti o .feature non valido):\n${r.stdout}${r.stderr}`);
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

export function runTests(cwd: string, env: NodeJS.ProcessEnv = {}, grep?: string): RunSummary {
  const out = join(cwd, 'test-results', 'orchestrator-report.json');
  const args = ['playwright', 'test', '--reporter=json', '--trace=off', '--retries=0'];
  if (grep) args.push('--grep', grep);
  bddgen(cwd);
  spawnSync('npx', args, {
    cwd,
    env: { ...process.env, ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
    stdio: 'ignore',
  });
  if (!existsSync(out)) throw new Error('Playwright non ha prodotto il report JSON');
  const report = JSON.parse(readFileSync(out, 'utf8'));

  const summary: RunSummary = { passed: 0, failed: 0, skipped: 0, failures: [] };
  const visit = (suite: JsonSuite, path: string[]) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        if (t.status === 'expected') summary.passed++;
        else if (t.status === 'skipped') summary.skipped++;
        else {
          summary.failed++;
          const last = t.results.at(-1);
          const ctx = last?.attachments?.find((a) => a.name === 'error-context')?.path;
          summary.failures.push({
            id: spec.id,
            title: [...path, spec.title].filter(Boolean).join(' › '),
            ...locate(spec.file),
            line: spec.line,
            error: stripAnsi(last?.error?.message ?? 'errore sconosciuto').slice(0, 1500),
            errorContext: ctx,
          });
        }
      }
    }
    for (const s of suite.suites ?? []) visit(s, [...path, s.title]);
  };
  for (const s of report.suites) visit(s, []);
  return summary;
}

// ---------- Passo 5: esecuzioni ripetute per scovare i test flaky ----------

export interface TestStats {
  id: string;
  title: string;
  file: string;
  kind: TestKind;
  line: number;
  runs: number;
  passes: number;
  /** Messaggi d'errore distinti visti nelle esecuzioni fallite. */
  errors: string[];
  errorContext?: string;
}

/**
 * Esegue ogni test `repeatEach` volte e conta i successi.
 * Un test è flaky se 0 < passes < runs: stesso codice, stesso ambiente, risultato diverso.
 * Anche qui niente LLM: è pura statistica.
 */
export function runRepeated(cwd: string, repeatEach: number): TestStats[] {
  const out = join(cwd, 'test-results', 'orchestrator-repeat.json');
  bddgen(cwd);
  spawnSync('npx', ['playwright', 'test', '--reporter=json', '--trace=off', '--retries=0', `--repeat-each=${repeatEach}`], {
    cwd,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
    stdio: 'ignore',
  });
  if (!existsSync(out)) throw new Error('Playwright non ha prodotto il report JSON');
  const report = JSON.parse(readFileSync(out, 'utf8'));

  const stats: TestStats[] = [];
  const visit = (suite: JsonSuite, path: string[]) => {
    for (const spec of suite.specs ?? []) {
      const s: TestStats = {
        id: spec.id,
        title: [...path, spec.title].filter(Boolean).join(' › '),
        ...locate(spec.file),
        line: spec.line,
        runs: 0,
        passes: 0,
        errors: [],
      };
      for (const t of spec.tests) {
        if (t.status === 'skipped') continue;
        s.runs++;
        if (t.status === 'expected') s.passes++;
        else {
          const last = t.results.at(-1);
          const msg = stripAnsi(last?.error?.message ?? 'errore sconosciuto').slice(0, 800);
          if (!s.errors.includes(msg)) s.errors.push(msg);
          s.errorContext ??= last?.attachments?.find((a) => a.name === 'error-context')?.path;
        }
      }
      stats.push(s);
    }
    for (const child of suite.suites ?? []) visit(child, [...path, child.title]);
  };
  for (const s of report.suites) visit(s, []);
  return stats;
}

/** Come presentare la posizione di un test a un agente o in un report. */
export function where(t: { file: string; line: number; kind: TestKind }): string {
  return t.kind === 'bdd' ? `${t.file} (scenario BDD; step definitions in features/steps/)` : `${t.file}:${t.line}`;
}
