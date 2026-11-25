# Report BDD: dal requisito al test

- **Funzionalità richiesta:** il catalogo dei prodotti: nomi e prezzi mostrati, e il carrello che parte vuoto
- **Nuovi .feature:** `features/catalogo.feature`
- **Step mancanti dopo il planner:** 1 · **dopo il generator:** 0
- **Suite:** 15 passati, 0 falliti
- **Durata:** 59 s · **Costo LLM:** $0.157 (budget $2.00)

> ✅ Nessun guardrail violato.


## Il requisito scritto dal planner
```gherkin
# language: it
Funzionalità: Catalogo prodotti
  Come cliente
  voglio vedere i prodotti disponibili con il loro prezzo
  per scegliere cosa acquistare partendo da un carrello vuoto

  Scenario: Il catalogo mostra i prodotti disponibili
    Dato che ho effettuato l'accesso
    Allora vedo la lista dei prodotti

  Schema dello scenario: Ogni prodotto mostra il suo prezzo
    Dato che ho effettuato l'accesso
    Allora vedo il prodotto "<prodotto>" al prezzo di "<prezzo>" €

    Esempi:
      | prodotto  | prezzo |
      | Tazza     | 8.50   |
      | Maglietta | 19.90  |
      | Quaderno  | 4.25   |

  Scenario: Il carrello parte vuoto
    Dato che ho effettuato l'accesso
    Allora il carrello contiene 0 articoli
    E il totale è "0.00" €

  Scenario: Senza accesso il catalogo non è visibile
    Dato che sono sulla pagina di accesso
    Allora non vedo la lista dei prodotti
```

## Step definitions aggiunte dal generator
```diff
diff --git a/features/steps/minishop.steps.ts b/features/steps/minishop.steps.ts
index cc1ec15..c779e8d 100644
--- a/features/steps/minishop.steps.ts
+++ b/features/steps/minishop.steps.ts
@@ -21,0 +22 @@ const ui = {
+  productRow: (page: Page, product: string) => page.getByRole('listitem').filter({ hasText: product }),
@@ -82,0 +84,4 @@ Then('il totale è {string} €', async ({ page }, total: string) => {
+Then('vedo il prodotto {string} al prezzo di {string} €', async ({ page }, product: string, price: string) => {
+  await expect(ui.productRow(page, product)).toContainText(`${product} · ${price} €`);
+});
+
```

## Costi per agente
| Agente | Modello | Chiamate | Costo |
|---|---|---|---|
| bdd-planner | sonnet | 1 | $0.063 |
| bdd-generator | sonnet | 1 | $0.094 |
| **Totale** | | **2** | **$0.157** su un budget di $2.00 |

## Note del planner
Ho creato `features/catalogo.feature` con 4 scenari. Non l'ho eseguito, perché non ci sono step definitions per la frase nuova.

Ho esplorato l'app su http://localhost:4311 dopo l'accesso. Il catalogo mostra Tazza a 8.50 €, Maglietta a 19.90 € e Quaderno a 4.25 €. Il carrello parte con 0 articoli e totale 0.00 €.

Gli scenari sono:
1. **Il catalogo mostra i prodotti disponibili:** dopo l'accesso si vede la lista dei prodotti.
2. **Ogni prodotto mostra il suo prezzo** (schema dello scenario con 3 esempi): controlla nome e prezzo di Tazza, Maglietta e Quaderno.
3. **Il carrello parte vuoto:** dopo l'accesso ci sono 0 articoli e il totale è 0.00 €.
4. **Senza accesso il catalogo non è visibile:** è il caso negativo. Dalla pagina di accesso la lista dei prodotti non compare.

Tutte le altre frasi sono riprese alla lettera dalle step definitions esistenti.

**Frase nuova che il generator dovrà implementare:**
- `Allora vedo il prodotto {string} al prezzo di {string} €`. Deve verificare che nella lista compaia il prodotto con il prezzo indicato. Nell'app il testo è del tipo "Tazza · 8.50 €".

## Note del generator
Ho implementato lo step mancante, e tutti e 6 gli scenari di `catalogo.feature` passano. `npx bddgen` ora non segnala più step mancanti.

Non ho potuto verificare il locator nello snapshot del browser, perché `browser_navigate` ha risposto "Must setup test before interacting with the page". L'ho ricavato dal sorgente dell'app: `demo-app/public/app.js:26` rende ogni prodotto come `<span>Tazza · 8.50 €</span>` dentro un `<li>`. L'esecuzione degli scenari conferma che funziona.

**Step aggiunti** (in `features/steps/minishop.steps.ts`)
- `Allora vedo il prodotto {string} al prezzo di {string} €`. Cerca la riga del prodotto con `ui.productRow` e controlla con `toContainText` che contenga `"<prodotto> · <prezzo> €"`.
- Nuovo locator `ui.productRow(page, product)`, che usa `getByRole('listitem')` filtrato per testo.

**Step riusati**
- `che ho effettuato l'accesso`
- `vedo la lista dei prodotti`
- `il carrello contiene {int} articoli`
- `il totale è {string} €`
- `che sono sulla pagina di accesso`
- `non vedo la lista dei prodotti`

**Scenari rossi:** nessuno. Non ho toccato i file `.feature` e non ho trovato anomalie nei requisiti.
