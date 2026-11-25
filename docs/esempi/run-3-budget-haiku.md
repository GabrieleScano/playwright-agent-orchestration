# Report orchestratore

- **Modifiche all'app non committate:** 
```
demo-app/public/app.js     | 2 +-
 demo-app/public/index.html | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
- **Prima:** 1 passati, 6 falliti, 0 saltati
- **Dopo:** 5 passati, 2 falliti, 0 saltati
- **Durata:** 107 s · **Costo LLM:** $0.078 (budget $1.00)

> ✅ Nessun guardrail violato.

| Giro | Test | Triage | Confidenza | Esito | Diagnosi |
|---|---|---|---|---|---|
| 1 | Carrello › il contatore si aggiorna dopo ogni aggiunta | `broken_test` | 97% | ✅ verde | Il test cerca un bottone "Entra" che non esiste più: l'app mostra il bottone "Login". L'app funziona correttamente, il locator è rimasto indietro rispetto al testo rinominato. |
| 1 | Carrello › Aggiunta dello stesso prodotto più volte | `broken_test` | 95% | ↪ rivalutato | Il test cerca un bottone "Entra" che nell'app non esiste più: il bottone di login si chiama "Login". L'app funziona, è il locator del test a essere rimasto indietro. |
| 1 | Checkout › Checkout con carrello vuoto è rifiutato | `broken_test` | 95% | ✅ verde | Il test cerca un bottone "Entra" per il login, ma l'app ha un bottone "Login". Il login funziona: il test è rimasto indietro rispetto a un'etichetta cambiata. |
| 1 | Login › Login rifiutato con password errata | `broken_test` | 95% | ✅ verde | Il test cerca il bottone "Entra", ma l'app ha il bottone "Login": il locator è rimasto indietro, non c'è un bug funzionale. |
| 1 | Mini Shop › login con password errata mostra un errore | `broken_test` | 92% | ✅ verde | Il test cerca un bottone "Entra", ma l'app ha un bottone "Login": il locator non trova l'elemento e il click va in timeout. L'app non è rotta, il test è rimasto indietro. |
| 1 | Mini Shop › utente aggiunge prodotti e conclude l'ordine | `broken_test` | 95% | ↪ rivalutato | Il test cerca un bottone "Entra" che non esiste più: l'app ha rinominato il pulsante di login in "Login". L'app funziona, il test è rimasto indietro. |
| 2 | Carrello › Aggiunta dello stesso prodotto più volte | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato: con 3 Quaderni (4,25 € l'uno) l'app mostra 12.00 € invece di 12.75 €. Il test sta facendo il suo lavoro; non va adattato. |
| 2 | Mini Shop › utente aggiunge prodotti e conclude l'ordine | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato: l'app mostra 12.00 invece di 12.75 perché tronca i prezzi con Math.floor invece di sommarli con i centesimi. Il test è corretto e non va adattato. |

## Bug dell'app
2 bug report in questa cartella (bug-*.md). I test relativi restano rossi finché l'app non viene corretta.

## Costi per agente
| Agente | Modello | Chiamate | Costo |
|---|---|---|---|
| failure-triage | haiku | 8 | $0.019 |
| playwright-test-healer | sonnet | 1 | $0.059 |
| **Totale** | | **9** | **$0.078** su un budget di $1.00 |

## Note dell'healer
### Giro 1
Ho sostituito il locator "Entra" con "Login" in tutti i file indicati. Dopo la correzione 4 test su 6 passano e 2 falliscono per un altro motivo.

**Modifiche (solo in `tests/`)**
- `tests/cart/contatore.spec.ts` (riga 10): `name: 'Entra'` → `'Login'`.
- `tests/cart/prodotto-ripetuto.spec.ts` (riga 12): `'Entra'` → `'Login'`.
- `tests/checkout/checkout-carrello-vuoto.spec.ts` (riga 12): `'Entra'` → `'Login'`.
- `tests/login/login-password-errata.spec.ts`: `'Entra'` → `'Login'` alla riga 11, più i commenti alle righe 13 e 22 ("Accedi" → "Login").
- `tests/shop.spec.ts` (righe 11 e 18): `'Entra'` → `'Login'`.

Non ho toccato le asserzioni, l'app, `specs/mini-shop.md` né creato l'helper di login. Non ho usato `test.fixme` o `test.skip`.

**Risultati**
- Passano: `contatore`, `checkout-carrello-vuoto`, `login-password-errata` e `shop.spec.ts:8`.
- Falliscono, ora oltre il login:
  - `tests/cart/prodotto-ripetuto.spec.ts:6`: `Totale: 12.75 €` non compare dopo 3 aggiunte (riga 21).
  - `tests/shop.spec.ts:15`: `cart-total` mostra `12.00` invece di `12.75` (riga 25).

Il totale dell'app non corrisponde ai valori attesi in entrambi i test. Potrebbe essere un bug dell'app, ad esempio nel calcolo o nell'arrotondamento dei prezzi. Potrebbe anche essere che le attese dei test siano sbagliate. Non l'ho verificato e ho lasciato i test falliti, così l'orchestratore può rifare il triage. Conviene riclassificarli come possibile `app_bug`, come il triage suggeriva per `prodotto-ripetuto`.

**Da fare a parte:** `specs/mini-shop.md` riporta ancora "Accedi" o "Entra" e va allineato a "Login". Sta fuori da `tests/`, quindi non l'ho modificato.
