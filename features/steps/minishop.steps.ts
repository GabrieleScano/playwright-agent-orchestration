/**
 * Step definitions: il "come" dietro le frasi Gherkin dei file .feature.
 *
 * Tre livelli, ognuno con un solo motivo per cambiare:
 *   .feature        → il COSA (requisito di business): cambia se cambia il requisito
 *   step definitions → la traduzione frase → azione: cambia se cambia una frase
 *   page objects     → il COME sulla UI (locator): cambia se cambia la UI   (pages/)
 *
 * Qui dentro quindi NON ci sono locator: solo chiamate ai page object e asserzioni web-first.
 */
import { createBdd } from 'playwright-bdd';
import { expect, test } from '../../pages/fixtures.js';

const { Given, When, Then } = createBdd(test);

// ---------- Dato (stato iniziale) ----------
Given('che sono sulla pagina di accesso', async ({ loginPage }) => {
  await loginPage.goto();
});

Given("che ho effettuato l'accesso", async ({ loginPage, shopPage }) => {
  await loginPage.loginAsDefaultUser();
  await expect(shopPage.heading).toBeVisible();
});

// ---------- Quando (azioni) ----------
When('accedo come {string} con password {string}', async ({ loginPage }, email: string, password: string) => {
  await loginPage.login(email, password);
});

When('aggiungo {string} al carrello', async ({ shopPage }, product: string) => {
  await shopPage.add(product);
});

When('aggiungo {int} volte {string} al carrello', async ({ shopPage }, times: number, product: string) => {
  await shopPage.add(product, times);
});

When('vado al pagamento', async ({ shopPage }) => {
  await shopPage.cart.checkout();
});

// ---------- Allora (verifiche, sempre web-first) ----------
Then('vedo la lista dei prodotti', async ({ shopPage }) => {
  await expect(shopPage.heading).toBeVisible();
});

Then('non vedo la lista dei prodotti', async ({ shopPage }) => {
  await expect(shopPage.heading).toBeHidden();
});

Then('vedo il messaggio di benvenuto {string}', async ({ shopPage }, text: string) => {
  await expect(shopPage.welcome(text)).toBeVisible();
});

Then("vedo l'errore {string}", async ({ loginPage }, text: string) => {
  await expect(loginPage.error).toHaveText(text);
});

Then('il carrello contiene {int} articoli', async ({ shopPage }, count: number) => {
  await expect(shopPage.cart.count).toHaveText(String(count));
});

Then('il totale è {string} €', async ({ shopPage }, total: string) => {
  await expect(shopPage.cart.total).toHaveText(total);
});

Then('vedo il prodotto {string} al prezzo di {string} €', async ({ shopPage }, product: string, price: string) => {
  await expect(shopPage.productRow(product)).toContainText(`${product} · ${price} €`);
});

Then('vedo lo stato {string}', async ({ shopPage }, text: string) => {
  await expect(shopPage.cart.status).toHaveText(text);
});
