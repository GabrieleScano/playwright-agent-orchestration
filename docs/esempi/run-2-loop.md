# Report orchestratore

- **Modifiche all'app non committate:** 
```
demo-app/public/app.js     | 2 +-
 demo-app/public/index.html | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
- **Prima:** 1 passati, 5 falliti, 0 saltati
- **Dopo:** 4 passati, 2 falliti, 0 saltati
- **Durata:** 99 s · **Costo LLM stimato:** $0.22

> ✅ Nessun guardrail violato.

| Giro | Test | Triage | Confidenza | Esito | Diagnosi |
|---|---|---|---|---|---|
| 1 | Carrello › Aggiunta dello stesso prodotto più volte | `broken_test` | 93% | ↪ rivalutato | Il test cerca il bottone di login con nome 'Entra', ma nell'app il bottone si chiama 'Login'. Il click va in timeout prima di arrivare ai controlli sul carrello. |
| 1 | Checkout › Checkout con carrello vuoto è rifiutato | `broken_test` | 93% | ✅ verde | Il test cerca il bottone di login "Entra", ma l'app mostra "Login", quindi il click va in timeout prima di arrivare al checkout. |
| 1 | Login › Login rifiutato con password errata | `broken_test` | 93% | ✅ verde | Il test cerca un pulsante chiamato 'Entra', ma nella pagina il pulsante si chiama 'Login'. Il click va in timeout perché il locator non trova nessun elemento. |
| 1 | Mini Shop › login con password errata mostra un errore | `broken_test` | 90% | ✅ verde | Il test cerca un bottone chiamato "Entra", ma l'app ora mostra "Login". Il locator è obsoleto e il click va in timeout. |
| 1 | Mini Shop › utente aggiunge prodotti e conclude l'ordine | `broken_test` | 95% | ↪ rivalutato | Il test cerca un bottone "Entra", ma nell'app il bottone di login si chiama "Login", quindi il click va in timeout. |
| 2 | Carrello › Aggiunta dello stesso prodotto più volte | `app_bug` | 97% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato: l'app tronca i prezzi con Math.floor, quindi 3 Quaderni da 4.25 € danno 12.00 € invece di 12.75 €. |
| 2 | Mini Shop › utente aggiunge prodotti e conclude l'ordine | `app_bug` | 98% | 🐞 resta rosso (corretto) | Il totale del carrello è sbagliato: l'app tronca i prezzi con Math.floor, quindi Tazza (8.50) + Quaderno (4.25) dà 12.00 invece di 12.75. |

## Bug dell'app
2 bug report in questa cartella (vedi [esempio](bug-report-esempio.md)). I test relativi restano rossi finché l'app non viene corretta.

## Note dell'healer
### Giro 1
Ho corretto il locator del login in tutti e quattro i file. Con la correzione 3 test su 5 passano. Gli altri 2 falliscono ancora, ma per un motivo diverso.

**Cosa ho cambiato**
In tutti e quattro i file ho sostituito `getByRole('button', { name: 'Entra' })` con `{ name: 'Login' }`:
- `tests/cart/prodotto-ripetuto.spec.ts`, riga 12.
- `tests/checkout/checkout-carrello-vuoto.spec.ts`, riga 12.
- `tests/login/login-password-errata.spec.ts`, riga 11. Il locator `accedi` è usato in due punti, quindi la modifica vale per entrambi i click.
- `tests/shop.spec.ts`, righe 11 e 18, cioè entrambi i test.

Non ho toccato le asserzioni, né `specs/` né l'app. Non ho creato l'helper di login suggerito, perché mi hai chiesto di limitarmi al fix. Il nome del bottone resta quindi ripetuto in più file.

**Risultati dopo la riesecuzione**
- Passano: `checkout-carrello-vuoto`, `login-password-errata` e `shop.spec.ts:8` (login con password errata).
- Falliscono ancora, e non per il login:
  - `tests/cart/prodotto-ripetuto.spec.ts:6`: dopo 3 click su "Aggiungi Quaderno" l'app mostra `Totale: 12.00 €`, mentre il test si aspetta `12.75 €`.
  - `tests/shop.spec.ts:15`: con una Tazza e un Quaderno `cart-total` vale `12.00`, mentre il test si aspetta `12.75`.

**Possibili cause dei due fallimenti**
- I due test aspettano 12.75 con combinazioni di prodotti diverse. Questo fa pensare a un'incoerenza nei prezzi attesi nei test, o a un bug di calcolo nell'app, o a entrambe le cose.
- Non ho verificato quale sia il valore giusto, perché non posso cambiare le asserzioni. Serve un nuovo triage, confrontando i prezzi in `specs/mini-shop.md` e in `demo-app/`.
