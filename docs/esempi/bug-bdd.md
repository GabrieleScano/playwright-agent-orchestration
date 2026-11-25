# 🐞 Il totale del carrello è sbagliato: l'app tronca i prezzi con Math.floor, quindi 2 Maglietta (19,90 € l'una) mostrano 38.00 invece dei 39.80 richiesti dallo scenario. Il test sta facendo il suo lavoro.

- **Test che lo rileva:** `features/carrello.feature (scenario BDD; step definitions in features/steps/)` – Carrello › Stesso prodotto più volte › Esempi: #2
- **Confidenza del triage:** 97%

## Prove
Scenario (features/carrello.feature, Esempi #2): "Quando aggiungo 2 volte "Maglietta" al carrello", "Allora il carrello contiene 2 articoli" (passa), "E il totale è "39.80" €". Il fallimento è sull'asserzione del totale: features/steps/minishop.steps.ts:79-80 (`toHaveText(total)` su getByTestId('cart-total')).
Snapshot error-context.md: `- text: "38.00"` e call log "locator resolved to <span data-testid="cart-total">38.00</span>" per 14 tentativi.
Codice app: demo-app/public/app.js:4 `{ id: 2, name: 'Maglietta', price: 19.9 }`; riga 36 `const total = cart.reduce((sum, p) => sum + Math.floor(p.price), 0);`. Math.floor(19.9) = 19, quindi 2 × 19 = 38 → "38.00". Il valore atteso 39.80 = 2 × 19.90, lo stesso prezzo mostrato in lista (riga 26, `p.price.toFixed(2)` → "19.90 €").
Lo stesso bug è già documentato in docs/esempi/bug-report-esempio.md e run-2-loop.md (Quaderno 4.25 → 12.00 invece di 12.75). Un utente vedrebbe un totale inferiore al prezzo esposto: è un bug reale, non un problema di locator o timing.

## Fix suggerito
Non modificare il test, il .feature, né aggiungere test.fixme o adattare il valore atteso: nasconderebbe il bug. Correggere l'app in demo-app/public/app.js riga 36, rimuovendo Math.floor e sommando i centesimi senza troncare, ad esempio lavorando in centesimi per evitare errori di floating point:
  const totalCents = cart.reduce((sum, p) => sum + Math.round(p.price * 100), 0);
  document.querySelector('[data-testid=cart-total]').textContent = (totalCents / 100).toFixed(2);
Dopo la correzione, gli Esempi #1 (12.75) e #2 (39.80) dovrebbero passare. Il .feature resta invariato.

## Errore originale
```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('cart-total')
Expected: "39.80"
Received: "38.00"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByTestId('cart-total') with timeout 5000ms
  - waiting for getByTestId('cart-total')
    14 × locator resolved to <span data-testid="cart-total">38.00</span>
       - unexpected value "38.00"

```
