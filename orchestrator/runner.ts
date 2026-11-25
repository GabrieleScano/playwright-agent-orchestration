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
  file: string;
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

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

export function runTests(cwd: string, env: NodeJS.ProcessEnv = {}, grep?: string): RunSummary {
  const out = join(cwd, 'test-results', 'orchestrator-report.json');
  const args = ['playwright', 'test', '--reporter=json', '--trace=off', '--retries=0'];
  if (grep) args.push('--grep', grep);
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
            file: spec.file,
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
