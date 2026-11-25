/** Utility condivise dagli orchestratori. */
import { execSync } from 'node:child_process';

export const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString('it-IT')}] ${msg}`);

/** Esegue fn su ogni elemento, al massimo `limit` alla volta (fan-out controllato). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Guardrail POM: i locator vivono solo in pages/. Se un agente aggiunge `page.getBy…` o `page.locator(…)`
 * in un test o in una step definition, la prossima modifica della UI andrà corretta in due posti.
 * Non blocca: lo segnala nel report, come una review.
 */
export function locatorsOutsidePages(cwd: string): string[] {
  const diff = execSync('git diff -U0 -- tests features/steps', { cwd }).toString();
  return diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++') && /\bpage\.(getBy\w+|locator)\(/.test(l))
    .map((l) => `Locator fuori dai page object (va in pages/): \`${l.slice(1).trim()}\``);
}
