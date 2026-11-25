# Passo 3 – I test agents di Playwright

`npx playwright init-agents --loop=claude` crea tre **subagenti** in `.claude/agents/`.
Ognuno è un file Markdown: un *system prompt* (il ruolo) più la lista dei *tool* MCP che può usare.
Il server MCP è `playwright run-test-mcp-server` (in `.mcp.json`), che oltre ai tool `browser_*`
ne aggiunge di specifici: `planner_save_plan`, `generator_write_test`, `test_run`, `test_debug`…

| Agente | Input | Output | Tool chiave |
|---|---|---|---|
| **planner** | app + `tests/seed.spec.ts` | piano Markdown in `specs/` | `planner_setup_page`, `planner_save_plan` |
| **generator** | uno scenario del piano | file `.spec.ts` | `generator_setup_page`, `generator_read_log`, `generator_write_test` |
| **healer** | test che falliscono | test riparati (o `test.fixme`) | `test_run`, `test_debug`, `browser_generate_locator` |

Il **seed** è il punto di partenza comune: tutto ciò che c'è nel test seed (navigazione, login, dati)
viene eseguito prima che l'agente inizi a lavorare.

## Come li abbiamo eseguiti

In modalità non interattiva, con permessi ristretti (l'healer può modificare solo `tests/`):

```bash
claude -p --agent playwright-test-planner   --mcp-config .mcp.json --allowedTools "mcp__playwright-test" Read Glob Grep LS "…prompt…"
claude -p --agent playwright-test-generator --mcp-config .mcp.json --allowedTools "mcp__playwright-test" Read Glob Grep LS "…prompt…"
claude -p --agent playwright-test-healer    --mcp-config .mcp.json --allowedTools "mcp__playwright-test" Read Glob Grep LS "Edit(tests/**)" "…prompt…"
```

In modo interattivo basta aprire Claude Code nel progetto e scrivere, ad esempio,
"usa il planner per creare un piano di test del Mini Shop".

## Risultati

1. **Planner** → [`specs/mini-shop.md`](../specs/mini-shop.md): 8 scenari (login, carrello, checkout, casi negativi).
   Nota: ha ricavato parte del comportamento leggendo il codice sorgente invece di esplorare tutto nel browser.
   In un caso reale (app esterna, black-box) esplorerebbe solo via browser.
2. **Generator** → 3 test (`tests/login/`, `tests/cart/`, `tests/checkout/`), tutti verdi al primo colpo.
   Nel log ha ammesso di aver cliccato l'elemento sbagliato (i `ref` cambiano dopo il login) e di essersi corretto
   rileggendo lo snapshot: il ciclo osserva → decidi → agisci visto nel Passo 2.
3. **Healer** → abbiamo rotto l'app apposta con due modifiche:
   - **cambio di UI legittimo**: bottone "Accedi" rinominato in "Entra";
   - **bug vero**: il totale usa `Math.floor(p.price)` e perde i centesimi.

   5 test su 6 falliscono. L'healer ([diff](passo-3-healer.diff)):
   - ha aggiornato il locator `Accedi → Entra` in 4 file ✅ (test fragile → riparato);
   - **non** ha cambiato le attese sul totale: ha marcato i 2 test con `test.fixme` e un commento
     "BUG APP" che indica la riga colpevole ✅ (bug dell'app → segnalato, non nascosto).

## La lezione per i passi successivi

Il rischio principale del self-healing è **"riparare" un test per farlo passare su un bug reale**.
Qui l'healer ha distinto bene i due casi, ma la decisione è nascosta dentro un singolo agente e
finisce in un commento. Nel Passo 4–5 la rendiamo esplicita: un agente di **triage** classifica ogni
fallimento (bug dell'app / test fragile / ambiente) e un orchestratore decide chi interviene.
