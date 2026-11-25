# Report orchestratore

- **Modifiche all'app non committate:** 
```
demo-app/public/app.js     | 2 +-
 demo-app/public/index.html | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
- **Prima:** 2 passati, 13 falliti, 0 saltati
- **Dopo:** 12 passati, 3 falliti, 0 saltati
- **Durata:** 190 s · **Costo LLM:** $0.152 (budget $1.00)

> ✅ Nessun guardrail violato.

| Giro | Test | Triage | Confidenza | Esito | Diagnosi |
|---|---|---|---|---|---|
| 1 | Carrello › il contatore si aggiorna dopo ogni aggiunta | `broken_test` | 97% | ✅ verde | Il test va in timeout perché il locator del page object cerca un bottone "Entra", mentre l'app ha rinominato il bottone di login in "Login". L'app funziona: email e password sono compilate correttamente e il bottone è presente. |
| 1 | Carrello › Prodotti diversi | `broken_test` | 95% | ↪ rivalutato | Il test cerca un bottone "Entra" per il login, ma l'app mostra un bottone "Login". Il login non viene mai completato, quindi il test va in timeout prima di arrivare agli step del carrello. L'app funziona: il locator è rimasto indietro. |
| 1 | Carrello › Stesso prodotto più volte › Esempi: #1 | `broken_test` | 95% | ↪ rivalutato | Il test fallisce nel login del Contesto ("Dato che ho effettuato l'accesso"), non nel carrello: il locator del bottone cerca "Entra", ma l'app ora mostra "Login". L'app funziona, il locator è rimasto indietro. |
| 1 | Carrello › Stesso prodotto più volte › Esempi: #2 | `broken_test` | 96% | ↪ rivalutato | Il click su "Entra" va in timeout perché l'app ha rinominato il bottone di login in "Login". Il requisito del .feature è rispettato: l'app non è rotta, il locator del Page Object è rimasto indietro. |
| 1 | Catalogo prodotti › Il catalogo mostra i prodotti disponibili | `broken_test` | 95% | ✅ verde | Il test cerca un bottone "Entra" per il login, ma l'app mostra un bottone "Login": il locator nel page object è rimasto indietro. Il requisito del .feature ("ho effettuato l'accesso, vedo la lista dei prodotti") non è contraddetto dall'app. |
| 1 | Catalogo prodotti › Il carrello parte vuoto | `broken_test` | 96% | ✅ verde | Il test cerca un bottone "Entra" per il login, ma l'app ha un bottone "Login": il locator è rimasto indietro, l'app funziona e il requisito dello scenario "Il carrello parte vuoto" non è toccato. |
| 1 | Catalogo prodotti › Ogni prodotto mostra il suo prezzo › Esempi: #1 | `broken_test` | 95% | ✅ verde | Il test cerca il bottone "Entra", ma l'app ha rinominato il bottone in "Login": il requisito (accedere al catalogo) è ancora soddisfatto, è il locator nel page object a essere rimasto indietro. |
| 1 | Catalogo prodotti › Ogni prodotto mostra il suo prezzo › Esempi: #2 | `broken_test` | 96% | ✅ verde | Il test cerca un bottone "Entra" per il login, ma l'app mostra un bottone "Login": il click va in timeout prima di arrivare agli step del catalogo. Il requisito del .feature (login, poi lista prodotti con prezzi) non è toccato. |
| 1 | Catalogo prodotti › Ogni prodotto mostra il suo prezzo › Esempi: #3 | `broken_test` | 95% | ✅ verde | Il test cerca un bottone "Entra" per il login, ma l'app ha un bottone "Login": il locator in LoginPage è rimasto indietro. L'app funziona: i campi sono compilati e il bottone c'è, quindi non è un bug dell'app. |
| 1 | Pagamento › Pagamento con carrello vuoto | `broken_test` | 96% | ✅ verde | Il test cerca un bottone "Entra" per il login, ma l'app ha rinominato il bottone in "Login": il click va in timeout nel contesto "Dato che ho effettuato l'accesso", prima ancora di arrivare allo scenario del carrello vuoto. Il requisito del .feature è rispettato dall'app. |
| 1 | Pagamento › Ordine confermato | `broken_test` | 95% | ✅ verde | Il test cerca un bottone "Entra" per il login, ma l'app mostra un bottone "Login": il locator del page object è rimasto indietro. Il requisito del .feature non è toccato, il fallimento avviene nel passo di login del Contesto. |
| 1 | Accesso al Mini Shop › Accesso con credenziali valide | `broken_test` | 95% | ✅ verde | Il test cerca un bottone "Entra" che nell'app non esiste più: il bottone di submit si chiama "Login". L'app funziona correttamente, il locator del page object è rimasto indietro. |
| 1 | Accesso al Mini Shop › Accesso rifiutato con password errata | `broken_test` | 95% | ✅ verde | Il test cerca un bottone "Entra" che nell'app non esiste più: il bottone di submit si chiama "Login". L'app funziona come previsto, quindi il fallimento è nel locator del page object, non in un bug applicativo. |
| 2 | Carrello › Prodotti diversi | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello mostra 12.00 invece di 12.75 con Tazza (8.50 €) e Quaderno (4.25 €): l'app tronca i prezzi con Math.floor. Il test fa il suo lavoro; il requisito del .feature è corretto. |
| 2 | Carrello › Stesso prodotto più volte › Esempi: #1 | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato nell'app: con 3 Quaderni (4,25 € l'uno) mostra 12.00 € invece di 12.75 €, come richiesto dallo scenario. Il test sta verificando correttamente il requisito. |
| 2 | Carrello › Stesso prodotto più volte › Esempi: #2 | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato: con 2 Magliette l'app mostra 38.00 invece di 39.80. Il test sta correttamente verificando il requisito del .feature; non va adattato. |

## Bug dell'app
3 bug report in questa cartella (bug-*.md). I test relativi restano rossi finché l'app non viene corretta.

## Costi per agente
| Agente | Modello | Chiamate | Costo |
|---|---|---|---|
| failure-triage | haiku | 16 | $0.056 |
| playwright-test-healer | sonnet | 1 | $0.097 |
| **Totale** | | **17** | **$0.152** su un budget di $1.00 |

## Note dell'healer
### Giro 1
Ho corretto il locator del login e 12 test su 15 ora passano. I 3 scenari del carrello continuano a fallire, ma per un motivo diverso.

**Cosa ho cambiato**
- In `pages/LoginPage.ts` (riga 20) ho cambiato `LoginPage.submit` da `{ name: 'Entra' }` a `{ name: 'Login' }`.
- Non ho toccato test, step definitions o file `.feature`.
- Nei file `.ts` di `tests/`, `features/` e `pages/` non resta nessun altro riferimento a "Entra". Restano solo la documentazione in `docs/` e, a quanto riportato nella diagnosi, `specs/mini-shop.md`. Non li ho modificati perché sono fuori dal perimetro che mi hai indicato.

**Passano ora** (login corretto)
- `contatore.spec.ts`
- Catalogo: tutti gli scenari, compresi i 3 Esempi sui prezzi
- Checkout: "Pagamento con carrello vuoto" e "Ordine confermato"
- Login: "Accesso con credenziali valide" e "Accesso rifiutato con password errata"

**Restano rossi** (il login ora funziona, falliscono sul totale del carrello, in `features/steps/minishop.steps.ts:65`)
- "Prodotti diversi": atteso `12.75`, l'app mostra `12.00`.
- "Stesso prodotto più volte", Esempi #1: atteso `12.75`, l'app mostra `12.00`.
- "Stesso prodotto più volte", Esempi #2: atteso `39.80`, l'app mostra `38.00`.

I totali mostrati dall'app hanno perso i decimali, come se fossero arrotondati per difetto. Il .feature è corretto e l'asserzione non va adattata. Secondo me è un `app_bug` da riclassificare, come previsto dal triage. Non ho usato `fixme` o `skip`.
