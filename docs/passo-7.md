# Passo 7 – BDD: il requisito separato dal test

Fin qui un test Playwright mescolava due cose: **cosa** deve fare l'app (il requisito) e **come** lo verifichiamo
(locator, click, asserzioni). Con il BDD (*Behaviour-Driven Development*) le separiamo:

| | Dove | Chi lo scrive | Chi lo legge |
|---|---|---|---|
| **COSA** | `features/*.feature` (Gherkin) | business, QA, `bdd-planner` | tutti, anche chi non programma |
| **COME** | `features/steps/*.ts` (step definitions) | SDET, `bdd-generator`, healer | chi mantiene i test |

Per l'orchestrazione questa separazione è oro: dà agli agenti una regola semplice e verificabile in codice.
**Gli step si possono riparare, i `.feature` no.**

## 1. playwright-bdd

[`playwright-bdd`](https://vitalets.github.io/playwright-bdd/) trasforma i `.feature` in normali test Playwright:

```
features/carrello.feature ─┐
                           ├─ npx bddgen ─▶ .features-gen/…spec.js ─▶ npx playwright test
features/steps/*.ts ───────┘
```

Quindi restano **tutti** gli strumenti di Playwright: UI mode, trace, report HTML, `--repeat-each`, la CI.
In [`playwright.config.ts`](../playwright.config.ts) ci sono due progetti: `chromium` (i test classici in `tests/`)
e `bdd` (gli scenari). `npm test` e `npm run test:ui` lanciano prima `bddgen`.

`bddgen` è anche il nostro **"compilatore" del BDD**: se una frase del `.feature` non ha uno step,
si ferma e stampa lo snippet da implementare. È un controllo deterministico, gratis, prima di qualsiasi LLM.

## 2. Gherkin in italiano

```gherkin
# language: it
Funzionalità: Carrello
  Come cliente del Mini Shop
  voglio vedere quanti articoli ho e quanto spendo
  per sapere cosa sto comprando prima di pagare

  Contesto:
    Dato che ho effettuato l'accesso

  Schema dello scenario: Stesso prodotto più volte
    Quando aggiungo <volte> volte "<prodotto>" al carrello
    Allora il carrello contiene <volte> articoli
    E il totale è "<totale>" €

    Esempi:
      | prodotto | volte | totale |
      | Quaderno | 3     | 12.75  |
      | Maglietta| 2     | 39.80  |
```

Perché l'italiano: il requisito deve essere nella lingua di chi lo concorda (business, cliente) e l'app è in italiano.
Gherkin supporta oltre 70 lingue: basta `# language: it` in testa. Le parole chiave diventano
`Funzionalità`, `Contesto`, `Scenario`, `Schema dello scenario`, `Esempi`, `Dato`, `Quando`, `Allora`, `E`, `Ma`.
In un team internazionale si sceglie l'inglese: cambia una riga, non l'architettura.

`Schema dello scenario` + `Esempi` è il modo BDD di fare test parametrici: un requisito, tanti dati.

## 3. Le step definitions: piccole e riusate

[`minishop.steps.ts`](../features/steps/minishop.steps.ts) ha un oggetto `ui` con **tutti** i locator in un posto solo:

```ts
const ui = {
  loginButton: (page: Page) => page.getByRole('button', { name: 'Entra' }),
  cartTotal: (page: Page) => page.getByTestId('cart-total'),
  // …
};
Then('il totale è {string} €', async ({ page }, totale: string) => {
  await expect(ui.cartTotal(page)).toHaveText(totale);
});
```

Le Cucumber Expressions (`{string}`, `{int}`) rendono una frase riusabile con dati diversi.
I 4 file di test che c'erano prima sono diventati 3 `.feature` (9 scenari) e **un** file di step.

## 4. Gli agenti nel mondo BDD

| Agente | Prima | Adesso |
|---|---|---|
| [`bdd-planner`](../.claude/agents/bdd-planner.md) | scriveva un piano Markdown | scrive un **nuovo** `.feature` in italiano, riusando alla lettera le frasi esistenti |
| [`bdd-generator`](../.claude/agents/bdd-generator.md) | scriveva un test intero | implementa **solo gli step che `bddgen` dice mancanti**, verificando i locator nel browser |
| `failure-triage` | test vs app | il `.feature` è il requisito: se l'app lo contraddice è `app_bug`, se uno step è rimasto indietro è `broken_test` |
| healer | modificava `tests/` | modifica `tests/` e `features/steps/`, **mai** i `.feature` |

### Il guardrail sui requisiti

L'agente potrebbe "risolvere" un bug cambiando `12.75` in `12.00` nel `.feature`. Lo impediamo su tre livelli:

1. **Prompt**: "non modificare mai i file `.feature`".
2. **Permessi**: `disallowedTools: ['Edit(features/**/*.feature)']`: lo strumento è proprio negato.
3. **Codice**: dopo ogni intervento `protectFeatureFiles()` in [index.ts](../orchestrator/index.ts) controlla
   `git diff` sui `.feature`, ripristina ogni modifica e la scrive nel report come violazione.

Il terzo livello è quello che conta: non dipende dal fatto che il modello obbedisca.

## 5. Risultato: un bottone rinominato, una riga corretta

Stesso commit "cattivo" del Passo 4 (`rename-button` + `price-bug`) ([report](esempi/run-bdd.md)):

- Giro 1: 8 rossi, tutti `broken_test` al 95%: il triage cita lo step `Dato che ho effettuato l'accesso` e dice
  esplicitamente "il requisito del `.feature` è ancora rispettato".
- L'healer cambia **una riga** (`ui.loginButton`: `'Entra'` → `'Login'`) e 6 scenari tornano verdi.
  Nel Passo 4 la stessa modifica toccava 6 file: è il vantaggio di avere i locator in un posto solo.
- Giro 2: i 3 scenari sul totale sono `app_bug` al 97% ("con 3 Quaderni l'app mostra 12.00 invece di 12.75").
  Restano rossi, con il [bug report](esempi/bug-bdd.md). Nessun `.feature` toccato.
- Costo: **$0.121** (triage haiku, healer sonnet).

## 6. Dal requisito al test verde: `npm run bdd`

[`orchestrator/bdd.ts`](../orchestrator/bdd.ts) concatena i due agenti nuovi:

```
bdd-planner ─▶ guardrail ─▶ bddgen ─▶ bdd-generator ─▶ guardrail ─▶ runner
 (il COSA)     .feature      (cosa      (il COME,        .feature      (verità
               esistenti     manca?)    solo step        intatti,       deterministica)
               intatti,                  mancanti)       niente cerotti,
               niente gergo                              bddgen pulito
               tecnico
```

```bash
npm run bdd -- "il catalogo dei prodotti: nomi e prezzi mostrati"
```

Regole del flusso:
- Se `bddgen` dice che non manca nessuno step (il planner ha riusato solo frasi esistenti), **il generator non parte**: costo zero.
- Il planner non può toccare `features/steps/`, il generator non può toccare i `.feature`: ruoli e permessi separati, come nel Passo 3.
- Uno scenario **nuovo** che resta rosso non si adatta: è un possibile bug o un requisito da chiarire, e decide una persona.
- Uno scenario **vecchio** che diventa rosso è una violazione: il generator ha rotto qualcosa.

### Esempio: il catalogo prodotti ([report](esempi/bdd-catalogo.md))

Il planner ha esplorato l'app e scritto [`catalogo.feature`](../features/catalogo.feature): 4 scenari (6 con gli esempi),
compreso il caso negativo "senza accesso il catalogo non è visibile". **Su 5 frasi diverse, 4 sono riusate alla lettera**
(`che ho effettuato l'accesso`, `vedo la lista dei prodotti`, `il carrello contiene 0 articoli`, ...).
`bddgen` ha trovato **1 sola frase mancante**, e il generator ha scritto solo quella:

```ts
productRow: (page: Page, product: string) => page.getByRole('listitem').filter({ hasText: product }),
// …
Then('vedo il prodotto {string} al prezzo di {string} €', async ({ page }, product: string, price: string) => {
  await expect(ui.productRow(page, product)).toContainText(`${product} · ${price} €`);
});
```

Il locator nuovo è finito nell'oggetto `ui`, l'asserzione è web-first. Suite: 15 passati, 0 falliti.
**Costo: $0.157** (planner $0.063, generator $0.094), 59 secondi.

Il riuso delle frasi è il motivo per cui il BDD scala: più scenari scrivi, meno step nuovi servono.

## Cosa portarsi via

- Il BDD dà agli agenti un **confine chiaro**: il requisito è di una persona, l'implementazione può essere dell'agente.
- Il confine si fa rispettare **in codice** (permessi + `git diff`), non solo nel prompt.
- `bddgen` è un controllo deterministico e gratuito: prima chiedi al compilatore, poi all'LLM.
- Locator centralizzati negli step = riparazioni più piccole, più economiche e più facili da rivedere.
