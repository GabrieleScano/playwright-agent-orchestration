/**
 * Il "cervello" intercambiabile.
 *
 * L'orchestratore non sa quale LLM c'è dietro: parla solo con l'interfaccia AgentEngine.
 * Oggi l'implementazione è ClaudeCodeEngine (usa la CLI `claude` e quindi l'abbonamento),
 * domani si può aggiungere un AnthropicApiEngine o un engine per un altro modello
 * senza toccare il resto del codice.
 */
import { spawn } from 'node:child_process';

export interface AgentTask {
  /** Nome di un subagente in .claude/agents/ (ruolo + tool consentiti). */
  agent: string;
  prompt: string;
  /** Tool che l'agente può usare: è il suo "perimetro di sicurezza". */
  allowedTools: string[];
  /** Tool o percorsi vietati, es. "Read(chaos/**)". */
  disallowedTools?: string[];
  /** Se presente, l'agente DEVE rispondere con un JSON valido per questo schema. */
  jsonSchema?: object;
  model?: string;
  /** Tetto di spesa per questa singola chiamata (in dollari). */
  maxBudgetUsd?: number;
}

export interface AgentResult<T = unknown> {
  text: string;
  data?: T;
  costUsd: number;
  durationMs: number;
}

export interface AgentEngine {
  run<T = unknown>(task: AgentTask): Promise<AgentResult<T>>;
}

export class ClaudeCodeEngine implements AgentEngine {
  constructor(private readonly opts: { cwd: string; mcpConfig: string; timeoutMs?: number }) {}

  run<T>(task: AgentTask): Promise<AgentResult<T>> {
    const args = [
      '-p', task.prompt,
      '--agent', task.agent,
      '--output-format', 'json',
      '--mcp-config', this.opts.mcpConfig,
      '--strict-mcp-config',
      '--model', task.model ?? 'sonnet',
      '--allowedTools', ...task.allowedTools,
    ];
    if (task.disallowedTools?.length) args.push('--disallowedTools', ...task.disallowedTools);
    if (task.maxBudgetUsd !== undefined && Number.isFinite(task.maxBudgetUsd))
      args.push('--max-budget-usd', task.maxBudgetUsd.toFixed(2));
    if (task.jsonSchema) args.push('--json-schema', JSON.stringify(task.jsonSchema));

    return new Promise((resolve, reject) => {
      const child = spawn('claude', args, { cwd: this.opts.cwd, env: process.env });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      const timer = setTimeout(() => child.kill('SIGTERM'), this.opts.timeoutMs ?? 10 * 60_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(out);
          if (json.is_error) throw new Error(json.result);
          resolve({
            text: json.result ?? '',
            data: json.structured_output as T | undefined,
            costUsd: json.total_cost_usd ?? 0,
            durationMs: json.duration_ms ?? 0,
          });
        } catch (e) {
          reject(new Error(`Agente ${task.agent} fallito (exit ${code}): ${(e as Error).message}\n${err}`));
        }
      });
    });
  }
}

// ---------- Passo 6: tetto di spesa ----------

export class BudgetExceededError extends Error {}

/**
 * Decorator: avvolge un qualsiasi AgentEngine e impone un tetto di spesa per esecuzione.
 * - prima di ogni chiamata controlla il budget residuo (se è finito, non chiama l'LLM);
 * - passa il residuo all'engine (`--max-budget-usd`), così anche una singola chiamata non può sforare;
 * - tiene un registro dei costi per agente, da mostrare nel report.
 * L'orchestratore non cambia: vede sempre e solo un AgentEngine.
 */
export class BudgetedEngine implements AgentEngine {
  readonly ledger: { agent: string; model: string; costUsd: number }[] = [];

  constructor(
    private readonly inner: AgentEngine,
    readonly budgetUsd: number,
  ) {}

  get spent() {
    return this.ledger.reduce((sum, e) => sum + e.costUsd, 0);
  }

  async run<T>(task: AgentTask): Promise<AgentResult<T>> {
    const remaining = this.budgetUsd - this.spent;
    if (remaining <= 0.01) throw new BudgetExceededError(`Budget di $${this.budgetUsd.toFixed(2)} esaurito`);
    const res = await this.inner.run<T>({ ...task, maxBudgetUsd: Math.min(task.maxBudgetUsd ?? Infinity, remaining) });
    this.ledger.push({ agent: task.agent, model: task.model ?? 'sonnet', costUsd: res.costUsd });
    return res;
  }

  /** Tabella Markdown dei costi per agente. */
  costTable(): string {
    const byAgent = new Map<string, { calls: number; cost: number; model: string }>();
    for (const e of this.ledger) {
      const row = byAgent.get(e.agent) ?? { calls: 0, cost: 0, model: e.model };
      row.calls++;
      row.cost += e.costUsd;
      byAgent.set(e.agent, row);
    }
    const rows = [...byAgent].map(([agent, r]) => `| ${agent} | ${r.model} | ${r.calls} | $${r.cost.toFixed(3)} |`);
    return [
      '| Agente | Modello | Chiamate | Costo |',
      '|---|---|---|---|',
      ...rows,
      `| **Totale** | | **${this.ledger.length}** | **$${this.spent.toFixed(3)}** su un budget di $${this.budgetUsd.toFixed(2)} |`,
    ].join('\n');
  }
}
