# Passo 8 – Page Object Model: un locator, un posto

Nel Passo 7 i locator stavano in un oggetto `ui` dentro le step definitions BDD. Il test classico
`contatore.spec.ts` però aveva i suoi, copiati. Con un bottone rinominato andavano corretti **due** posti.
Il **Page Object Model (POM)** risolve questo: ogni pagina dell'app ha una classe che sa *come* usarla,
e tutti i test (classici e BDD) passano da lì.

## 1. Tre livelli, ognuno con un solo motivo per cambiare

```
features/*.feature        il COSA (requisito)       cambia se cambia il requisito     → solo una persona
features/steps/*.ts       frase → azione            cambia se cambia una frase        → generator
tests/**/*.spec.ts        test classici             cambia se cambia lo scenario
pages/*.ts                il COME sulla UI          cambia se cambia la UI            → healer
```

## 2. I page object

[`pages/LoginPage.ts`](../pages/LoginPage.ts) e [`pages/ShopPage.ts`](../pages/ShopPage.ts):

```ts
export class LoginPage {
  readonly submit: Locator;
  constructor(readonly page: Page) {
    this.submit = page.getByRole('button', { name: 'Entra' });
    // …
  }
  async login(email: string, password: string) { /* fill, fill, click */ }
  async loginAsDefaultUser() { /* goto + login */ }
}
```

- I **locator** sono proprietà (`submit`, `error`) o metodi se dipendono da un dato (`addButton('Tazza')`).
- Le **azioni** sono metodi con il nome di ciò che fa l'utente (`login`, `add`, `checkout`).
- Le **asserzioni restano nei test**: il page object dice *dove* guardare, il test dice *cosa* aspettarsi.
  Così l'healer, correggendo un page object, non può "aggiustare" un valore atteso.
- Il carrello è un **component object** (`CartPanel`) dentro `ShopPage`: `shopPage.cart.total`.

## 3. Fixture invece di `new`

[`pages/fixtures.ts`](../pages/fixtures.ts) estende `test` con due fixture:

```ts
export const test = base.extend<{ loginPage: LoginPage; shopPage: ShopPage }>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  shopPage: async ({ page }, use) => use(new ShopPage(page)),
});
```

Test classico e step BDD li ricevono allo stesso modo:

```ts
// tests/cart/contatore.spec.ts
test('il contatore si aggiorna', async ({ loginPage, shopPage }) => {
  await loginPage.loginAsDefaultUser();
  await shopPage.add('Tazza');
  await expect(shopPage.cart.count).toHaveText('1');
});

// features/steps/minishop.steps.ts
const { Given, When, Then } = createBdd(test);
Then('il totale è {string} €', async ({ shopPage }, total: string) => {
  await expect(shopPage.cart.total).toHaveText(total);
});
```

Un dettaglio: la base è il `test` di **playwright-bdd** (non di `@playwright/test`), perché `createBdd(test)`
lo richiede. È un `test` di Playwright con qualcosa in più, quindi va bene anche per i test classici.
In [`playwright.config.ts`](../playwright.config.ts) `steps` include anche `pages/fixtures.ts`, così `bddgen` lo trova.

Le step definitions ora **non hanno nessun locator**: solo chiamate ai page object e asserzioni web-first.

## 4. Gli agenti e il POM

| Agente | Regola nuova |
|---|---|
| `failure-triage` | se il problema è un locator, `suggested_fix` indica **page object e proprietà** (`LoginPage.submit`), non il test |
| healer | può modificare `pages/**`; i locator si correggono **solo** nei page object |
| `bdd-generator` | riusa le fixture; un locator nuovo va nel page object giusto, mai negli step |
| `playwright-test-generator` | importa `test` da `pages/fixtures.js` e usa le fixture |

**Guardrail nuovo** (`locatorsOutsidePages()` in [util.ts](../orchestrator/util.ts)): dopo ogni intervento
l'orchestratore guarda il diff di `tests/` e `features/steps/`. Se un agente ha aggiunto `page.getBy…` o
`page.locator(…)` fuori da `pages/`, lo scrive nel report come violazione. Non blocca: è una review automatica.
Vale per `npm run orchestrate`, `npm run flaky` e `npm run bdd`. Il guardrail sui `.feature` resta.

## 5. L'esperimento, di nuovo

Stesso commit "cattivo" dei passi precedenti (bottone rinominato + bug nel totale), suite di 15 test
(1 classico + 14 scenari BDD, compreso il catalogo del Passo 7).

**Primo tentativo: l'interruttore di sicurezza.** 13 test rossi su 15, oltre la soglia `MAX_FAILURES=10`:
nessun agente chiamato, costo $0 ([report](esempi/run-pom-interruttore.md)). È il comportamento voluto del Passo 6:
quando quasi tutto è rosso di solito è l'app giù o un deploy rotto, e pagare 13 triage non serve.
Qui sappiamo che è un bottone rinominato, quindi rilanciamo con `MAX_FAILURES=20`.

**Secondo tentativo** ([report](esempi/run-pom.md)):

| | Passo 4 (test classici) | Passo 7 (BDD + `ui`) | **Passo 8 (POM)** |
|---|---|---|---|
| Test rossi per il bottone | 6 | 8 | 13 |
| File modificati dall'healer | 6 | 2 (steps + test classico) | **1** (`pages/LoginPage.ts`) |
| Righe modificate | 6 | 2 | **1** |
| Bug sul totale rimasti rossi | 2 | 3 | 3 |
| Costo | $0.078 | $0.121 | $0.152 |

- Il triage ha scritto già nella diagnosi "il locator in **LoginPage** è rimasto indietro".
- L'healer ha cambiato **una riga**: `LoginPage.submit` da `'Entra'` a `'Login'`. 10 test tornano verdi,
  sia gli scenari BDD sia il test classico.
- I 3 scenari sul totale sono `app_bug` al 97%, restano rossi con un bug report ciascuno. Nessun `.feature` toccato,
  nessun locator fuori da `pages/`.

**Dove va il costo adesso.** Healer: $0.097 per 1 chiamata. Triage: $0.056 per **16** chiamate, 13 delle quali
dicono la stessa cosa. Con il POM la riparazione è una sola, ma il triage è ancora uno per test.
Il prossimo passo naturale è **raggruppare i fallimenti con lo stesso errore** (stesso locator, stesso messaggio)
e fare un triage per gruppo: 13 chiamate diventerebbero 1–2.

## Cosa portarsi via

- POM = **un locator, un posto**. Per un agente significa riparazioni da una riga, facili da rivedere in una PR.
- Asserzioni nei test, locator nei page object: chi ripara la UI non può toccare i valori attesi.
- Le fixture fanno condividere i page object a test classici e BDD senza codice duplicato.
- Più la suite cresce, più conta: i test rotti aumentano (6 → 13), la riparazione no (6 righe → 1).
