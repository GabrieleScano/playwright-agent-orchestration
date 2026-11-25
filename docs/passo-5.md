# Passo 5 – Caccia ai test flaky

Un test **flaky** passa e fallisce a caso, senza che cambi il codice. È peggio di un test rosso:
il team impara a "rilanciare la pipeline" e smette di fidarsi della suite.

Il triage del Passo 4 non basta: guarda **un** fallimento. Un test flaky si riconosce solo
guardando **tante esecuzioni** dello stesso test.

```
runner ×10  ──▶  0 < successi < 10 ?  ──▶  flaky-analyst (sola lettura, JSON)
 (statistica)                                   │
                                                ├─ test_timing → healer (solo tests/, niente cerotti)
                                                ├─ app_race    → bug report
                                                └─ altro       → persona
                                                ▼
                         guardrail sul diff  +  runner ×20 per confermare
```

## Concetti

1. **Il rilevamento è statistica, non AI.** `--repeat-each=10` esegue ogni test 10 volte.
   Se un test passa 10/10 è stabile, 0/10 è rotto (lo gestisce `npm run orchestrate`), qualsiasi
   altro valore è flaky. Attenzione: con pochi giri un test raramente instabile può sfuggire.
   Più esecuzioni danno più fiducia, ma costano più tempo.
2. **L'agente cerca la causa radice.** Le categorie sono diverse dal Passo 4:
   - `test_timing`: l'app arriva sempre allo stato giusto, ma il test non aspetta (es. `expect(await x.textContent())`);
   - `app_race`: l'app stessa a volte sbaglia (il test fa bene a fallire);
   - `environment`: rete, CPU, servizi esterni.
3. **Niente cerotti.** Le "soluzioni" classiche ai test flaky sono `waitForTimeout(2000)`, aumentare i retry
   o saltare il test. Nascondono il problema e rallentano la suite. Il prompt le vieta, ma soprattutto un
   **guardrail in codice** analizza il diff e segnala ogni riga aggiunta che le contiene.
   Non ci si fida della promessa dell'agente: si controlla il risultato.
4. **La verifica usa più esecuzioni dell'analisi.** Dopo la correzione ogni test gira 20 volte. Un "passa una volta"
   non dimostra niente su un test flaky (l'healer stesso, nelle note, dice di averlo eseguito una volta sola).

## L'esperimento

- `tests/cart/contatore.spec.ts` è scritto "di fretta": legge il contatore con `textContent()` e lo confronta
  con `expect(...).toBe(...)`, che non riprova.
- Sull'app normale passa sempre, perché il carrello si aggiorna in modo sincrono.
- `npm run chaos -- slow-cart` rende l'aggiornamento asincrono nel 20% dei click (200 ms), come una chiamata API.
  È un cambiamento **legittimo** dell'app, ma smaschera il test fragile.

Risultato ([report completo](esempi/flaky-run.md)):

| Test | Prima | Diagnosi | Dopo |
|---|---|---|---|
| il contatore si aggiorna dopo ogni aggiunta | 9/10 | `test_timing` 95% | 20/20 |

Gli altri 6 test sono rimasti 10/10, perché usavano già asserzioni web-first (`await expect(locator).toHaveText()`).
La correzione dell'healer:

```diff
-    expect(await page.getByTestId('cart-count').textContent()).toBe('1');
+    await expect(page.getByTestId('cart-count')).toHaveText('1');
```

95 secondi in tutto, circa 0,06 $ di LLM. Il costo è basso perché l'LLM interviene su 1 test su 7:
gli altri li ha esclusi la statistica.

## Provalo

```bash
# recupera la versione fragile del test (il commit prima della correzione)
git checkout $(git log --format=%h -n 1 --grep='rilevamento dei test flaky') -- tests/cart/contatore.spec.ts
npm run chaos -- slow-cart
npm run flaky                     # REPEAT=20 npm run flaky per più fiducia
npm run chaos:reset && git checkout -- tests
```
