# Report orchestratore

- **Modifiche all'app non committate:** 
```
demo-app/public/app.js     | 2 +-
 demo-app/public/index.html | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
- **Prima:** 1 passati, 8 falliti, 0 saltati
- **Dopo:** 6 passati, 3 falliti, 0 saltati
- **Durata:** 150 s · **Costo LLM:** $0.121 (budget $1.00)

> ✅ Nessun guardrail violato.

| Giro | Test | Triage | Confidenza | Esito | Diagnosi |
|---|---|---|---|---|---|
| 1 | Carrello › il contatore si aggiorna dopo ogni aggiunta | `broken_test` | 96% | ✅ verde | Il test cerca un bottone di login chiamato "Entra", ma l'app ha rinominato il bottone in "Login": il click va in timeout prima di arrivare alla logica del carrello, che non viene mai testata. L'app funziona, il locator del test è rimasto indietro. |
| 1 | Carrello › Prodotti diversi | `broken_test` | 95% | ↪ rivalutato | Il test cerca un bottone "Entra" per il login, ma l'app ha rinominato il bottone in "Login". Il login funziona (email e password sono compilate), quindi il locator nella step definition è rimasto indietro: non è un bug dell'app. |
| 1 | Carrello › Stesso prodotto più volte › Esempi: #1 | `broken_test` | 95% | ↪ rivalutato | Il test cerca un bottone di login chiamato "Entra", ma l'app espone un bottone "Login". Il login non viene mai eseguito, quindi il click va in timeout prima di arrivare agli step del carrello. Il requisito del .feature resta valido: l'app funziona, è il locator a essere rimasto indietro. |
| 1 | Carrello › Stesso prodotto più volte › Esempi: #2 | `broken_test` | 95% | ↪ rivalutato | Il test cerca un bottone "Entra" per il login, ma l'app ha rinominato il bottone in "Login". Il requisito del .feature (login effettuato, poi carrello) è ancora rispettato: il fallimento è nel locator della step definition, non nell'app. |
| 1 | Pagamento › Pagamento con carrello vuoto | `broken_test` | 95% | ✅ verde | Il test cerca il bottone "Entra", ma l'app ha rinominato il bottone di login in "Login". Il login funziona come previsto: il test è rimasto indietro, non c'è un bug nell'app. |
| 1 | Pagamento › Ordine confermato | `broken_test` | 95% | ✅ verde | Il test cerca un bottone "Entra" per il login, ma l'app mostra un bottone "Login". Il requisito del `.feature` (carrello, pagamento, "Ordine confermato!") non è toccato: il fallimento avviene prima, nel login del contesto. |
| 1 | Accesso al Mini Shop › Accesso con credenziali valide | `broken_test` | 95% | ✅ verde | Il test cerca il bottone "Entra", ma l'app ha il bottone "Login". Il comportamento dell'app è corretto: il login con credenziali valide funziona e mostra la lista prodotti, quindi il requisito del .feature è rispettato. È la step definition a essere rimasta indietro. |
| 1 | Accesso al Mini Shop › Accesso rifiutato con password errata | `broken_test` | 95% | ✅ verde | Il test cerca un bottone "Entra" che non esiste più: l'app ha rinominato il pulsante di accesso in "Login". Il requisito (password errata → errore "Credenziali non valide" e nessuna lista prodotti) non è toccato, quindi è un locator rimasto indietro. |
| 2 | Carrello › Prodotti diversi | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato nell'app: con Tazza (8,50 €) e Quaderno (4,25 €) mostra 12.00 invece di 12.75. Il test sta facendo il suo lavoro; non va adattato. |
| 2 | Carrello › Stesso prodotto più volte › Esempi: #1 | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato: con 3 Quaderni l'app mostra 12.00 invece di 12.75. Il test sta verificando correttamente il requisito del .feature, quindi non va adattato. |
| 2 | Carrello › Stesso prodotto più volte › Esempi: #2 | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato: l'app tronca i prezzi con Math.floor, quindi 2 Maglietta (19,90 € l'una) mostrano 38.00 invece dei 39.80 richiesti dallo scenario. Il test sta facendo il suo lavoro. |

## Bug dell'app
3 bug report in questa cartella (bug-*.md). I test relativi restano rossi finché l'app non viene corretta.

## Costi per agente
| Agente | Modello | Chiamate | Costo |
|---|---|---|---|
| failure-triage | haiku | 11 | $0.040 |
| playwright-test-healer | sonnet | 1 | $0.082 |
| **Totale** | | **12** | **$0.121** su un budget di $1.00 |

## Note dell'healer
### Giro 1
Ho corretto il locator del login, e 6 test su 9 ora passano. Restano 3 scenari in `carrello.feature` che falliscono per un altro motivo. Come richiesto, non li ho toccati e non ho usato `fixme` o `skip`.

**Cosa ho cambiato**
- `features/steps/minishop.steps.ts:17`: `ui.loginButton` ora cerca `{ name: 'Login' }` al posto di `'Entra'`. È il locator condiviso da `login()`, quindi sistema tutti gli scenari BDD.
- `tests/cart/contatore.spec.ts:10`: stesso cambio da `'Entra'` a `'Login'`.
- Non ho modificato i file `.feature` né le asserzioni sui valori mostrati all'utente.
- `tests/cart/prodotto-ripetuto.spec.ts` non esiste più, quindi non c'era nulla da allineare.
- Non ho toccato `specs/mini-shop.md` e `docs/esempi/`, che sono fuori dal perimetro (solo `tests/` e `features/steps/`).
- Non ho introdotto un helper condiviso per il bottone. Il locator resta duplicato in due file.

**Passano (6 su 9)**
- `contatore.spec.ts`, il test principale.
- `checkout.feature`: "Pagamento con carrello vuoto" e "Ordine confermato".
- `login.feature`: "Accesso con credenziali valide" e "Accesso rifiutato con password errata".
- `seed.spec.ts`.

**Falliscono ancora (3 su 9)**

Il login ora funziona, ma il totale del carrello non corrisponde a quello atteso. Lo step fallisce a `minishop.steps.ts:105`.

| Scenario | Atteso | Ricevuto |
|---|---|---|
| Carrello › Prodotti diversi | 12.75 | 12.00 |
| Stesso prodotto più volte › Esempi #1 | 12.75 | 12.00 |
| Stesso prodotto più volte › Esempi #2 | 39.80 | 38.00 |

Sembra un problema nel calcolo del totale dell'app, non nel locator. Gli scenari richiedono il totale concordato dal business, quindi non ho cambiato i valori attesi. Serve un nuovo triage, probabilmente come `app_bug`.
