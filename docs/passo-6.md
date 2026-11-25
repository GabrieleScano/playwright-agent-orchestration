# Passo 6 – CI e controllo dei costi

La domanda giusta prima di mettere agenti in una pipeline è: **quanto costa ogni esecuzione, e chi la ferma
se qualcosa va storto?** In questo passo la risposta diventa codice.

## 1. Agenti solo sul rosso

Il workflow [`e2e.yml`](../.github/workflows/e2e.yml) ha tre job:

| Job | Quando | Usa l'LLM? |
|---|---|---|
| `test` | ogni push e PR | no |
| `orchestrate` | solo se `test` fallisce **e** c'è `ANTHROPIC_API_KEY` | sì, con budget $0.50 |
| `flaky` | ogni notte (03:00 UTC) o a mano | solo con la API key, altrimenti solo statistica |

Una pipeline verde costa zero token. Senza API key il progetto funziona lo stesso: i test girano e
la caccia ai flaky dice **quali** test sono instabili (ma non **perché**).

## 2. Il budget come decorator

`BudgetedEngine` ([engine.ts](../orchestrator/engine.ts)) avvolge qualsiasi `AgentEngine`:

```ts
const engine = new BudgetedEngine(new ClaudeCodeEngine({ ... }), BUDGET_USD);
```

- prima di ogni chiamata controlla il residuo: se il budget è finito, **non chiama l'LLM** e il test va a una persona;
- passa il residuo alla singola chiamata (`--max-budget-usd`), così anche un agente "in loop" si ferma;
- registra costo e modello di ogni chiamata, per la tabella nel report.

L'orchestratore non è cambiato: vede sempre un `AgentEngine`. È il vantaggio dell'interfaccia del Passo 4.

Limite noto: i triage girano in parallelo (3 alla volta), quindi l'ultimo gruppo può superare di poco il budget
prima che il controllo se ne accorga. Ogni singola chiamata resta comunque limitata dal residuo.

## 3. Il modello giusto per il ruolo

| Ruolo | Compito | Modello |
|---|---|---|
| triage / flaky-analyst | leggere un errore e classificarlo | `haiku` |
| healer | navigare, debuggare, modificare codice | `sonnet` |

Stesso scenario del Passo 4 (bottone rinominato + bug nel totale), stesse diagnosi:

| Triage con | Costo totale | Note |
|---|---|---|
| sonnet | $0.22 | [run-2](esempi/run-2-loop.md) |
| **haiku** | **$0.078** | [run-3](esempi/run-3-budget-haiku.md): 8 triage a $0.019 in tutto, l'healer pesa il 75% |

## 4. Interruttore di sicurezza

Se falliscono più di `MAX_FAILURES` test (default 10), quasi sempre il problema è sistemico: l'app non risponde,
il deploy è rotto, manca una variabile d'ambiente. Un agente per ciascun test costerebbe molto e direbbe 10 volte
la stessa cosa. L'orchestratore si ferma, scrive i primi errori nel report e non chiama nessun agente.

```
⛔ 6 test falliti (soglia 3): probabile problema sistemico, niente agenti.   costo $0.000
```

## 5. In CI l'healer propone, non decide

Le modifiche dell'healer finiscono in `reports/healer.patch`, caricato come artifact. Nessun commit automatico:
una persona guarda il diff e lo applica. È lo stesso principio dei guardrail, applicato all'ultimo passo.

## Provalo su GitHub

1. *Settings → Secrets and variables → Actions*: aggiungi `ANTHROPIC_API_KEY` (opzionale).
2. *Actions → E2E → Run workflow*, con `chaos` = `rename-button,price-bug`.
3. Apri il job **Triage e self-healing**: il report e i costi sono nel riepilogo, la patch negli artifact.
