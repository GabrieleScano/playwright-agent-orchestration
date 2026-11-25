# 🐞 Il totale del carrello è sbagliato: l'app tronca i prezzi con Math.floor, quindi 3 Quaderni da 4.25 € danno 12.00 € invece di 12.75 €.

- **Test che lo rileva:** `tests/cart/prodotto-ripetuto.spec.ts:6` – Carrello › Aggiunta dello stesso prodotto più volte
- **Confidenza del triage:** 97%

## Prove
Lo snapshot mostra "Articoli: 3" e "Totale: 12.00 €", mentre il test si aspetta "Totale: 12.75 €". Il prezzo del Quaderno è 4.25 € (3 × 4.25 = 12.75). In demo-app/public/app.js:36 il totale è calcolato con `cart.reduce((sum, p) => sum + Math.floor(p.price), 0)`. Math.floor porta 4.25 a 4, quindi 3 × 4 = 12.00. Il contatore e i click funzionano. Sbaglia solo il calcolo del totale, e un utente se ne accorgerebbe.

## Fix suggerito
Correggere l'app, non il test. In demo-app/public/app.js:36 togliere Math.floor e sommare il prezzo esatto: `sum + p.price`. Per evitare errori di virgola mobile, si può lavorare in centesimi (Math.round(p.price*100)) e dividere per 100 solo alla visualizzazione. Il test è corretto e va lasciato com'è. Dopo la correzione i totali attesi sono 12.75 e 52.55.

## Errore originale
```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Totale: 12.75 €')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Totale: 12.75 €') with timeout 5000ms
  - waiting for getByText('Totale: 12.75 €')

```
