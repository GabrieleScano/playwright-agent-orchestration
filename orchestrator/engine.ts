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
