# Report test flaky

- **Esecuzioni per test:** 10 (verifica: 20)
- **Test flaky trovati:** 1 su 7
- **Durata:** 95 s · **Costo LLM stimato:** $0.06

> ✅ Nessun guardrail violato: nessun cerotto, test stabili alla verifica.

| Test | Prima | Diagnosi | Dopo | Causa |
|---|---|---|---|---|
| Carrello › il contatore si aggiorna dopo ogni aggiunta | 9/10 | `test_timing` 95% | 20/20 | Il test legge il contatore una sola volta con `textContent()` e lo confronta con `expect(valore).toBe(...)`, che non riprova. Quando l'app rimanda il render di 200ms, il test legge ancora "0". |

## Diagnosi dettagliate
### Carrello › il contatore si aggiorna dopo ogni aggiunta
**Prove:** tests/cart/contatore.spec.ts:13 e :16 usano `expect(await page.getByTestId('cart-count').textContent()).toBe('1')`. `textContent()` restituisce subito il valore corrente e `toBe` lavora su una stringa già letta, quindi non c'è alcun retry. demo-app/public/app.js:29 contiene `btn.addEventListener('click', () => { cart.push(p); Math.random() < 0.2 ? setTimeout(render, 200) : render(); })`. In circa il 20% dei click il render è ritardato di 200ms. `cart.push(p)` avviene subito e `render()` (riga 35) scrive sempre `cart.length` nel DOM, quindi lo stato finale è sempre corretto: l'app arriva al valore giusto, ma in ritardo. L'errore osservato (Expected "1", Received "0") corrisponde alla lettura prima del render ritardato. Il commento nel test ammette di leggere il testo una sola volta, senza asserzione web-first.

**Fix proposto:** Sostituire le due asserzioni con asserzioni web-first che riprovano fino al timeout: `await expect(page.getByTestId('cart-count')).toHaveText('1');` e `await expect(page.getByTestId('cart-count')).toHaveText('2');`. Non servono retry globali né `waitForTimeout`. L'app non ha bug utente: il ritardo di 200ms è solo latenza simulata.

## Note dell'healer
Ho reso deterministico il test `tests/cart/contatore.spec.ts`, e ora passa. L'ho eseguito una sola volta, quindi non ho verificato la stabilità su più esecuzioni.

**Cosa ho cambiato (solo in `tests/cart/contatore.spec.ts`):**
- Riga 13: ho sostituito `expect(await page.getByTestId('cart-count').textContent()).toBe('1')` con `await expect(page.getByTestId('cart-count')).toHaveText('1')`.
- Riga 16: ho sostituito l'asserzione analoga per il valore `'2'` con `await expect(page.getByTestId('cart-count')).toHaveText('2')`.

**Perché era flaky:** `textContent()` legge il valore una sola volta. Se l'app ritarda il render di 200ms, il test leggeva ancora "0". `toHaveText` è un'asserzione web-first e riprova finché il testo corrisponde o scade il timeout.

Non ho usato `waitForTimeout`, non ho aumentato retry o timeout e non ho messo `test.skip` o `fixme`. Non ho toccato nessun file fuori da `tests/`.

## Diff dei test
```diff
diff --git a/tests/cart/contatore.spec.ts b/tests/cart/contatore.spec.ts
index f5b4b27..706d0c2 100644
--- a/tests/cart/contatore.spec.ts
+++ b/tests/cart/contatore.spec.ts
@@ -13 +13 @@ test.describe('Carrello', () => {
-    expect(await page.getByTestId('cart-count').textContent()).toBe('1');
+    await expect(page.getByTestId('cart-count')).toHaveText('1');
@@ -16 +16 @@ test.describe('Carrello', () => {
-    expect(await page.getByTestId('cart-count').textContent()).toBe('2');
+    await expect(page.getByTestId('cart-count')).toHaveText('2');

```
