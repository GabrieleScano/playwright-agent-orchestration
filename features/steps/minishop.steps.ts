/**
 * Step definitions: il "come" dietro le frasi Gherkin dei file .feature.
 *
 * Regola d'oro del BDD: i .feature descrivono il COSA (il comportamento atteso, in linguaggio di business)
 * e non cambiano quando cambia la UI. Qui dentro sta il COME (locator, clic, attese): se la UI cambia,
 * si aggiorna solo questo file, e una sola volta per tutti gli scenari che usano la stessa frase.
 */
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

// ---------- Locator condivisi: un solo punto da aggiornare se la UI cambia ----------
const ui = {
  email: (page: Page) => page.getByLabel('Email'),
  password: (page: Page) => page.getByLabel('Password'),
  loginButton: (page: Page) => page.getByRole('button', { name: 'Entra' }),
  productsHeading: (page: Page) => page.getByRole('heading', { name: 'Prodotti' }),
  addButton: (page: Page, product: string) => page.getByRole('button', { name: `Aggiungi ${product}` }),
  cartCount: (page: Page) => page.getByTestId('cart-count'),
  cartTotal: (page: Page) => page.getByTestId('cart-total'),
};

async function login(page: Page, email: string, password: string) {
  await ui.email(page).fill(email);
  await ui.password(page).fill(password);
  await ui.loginButton(page).click();
}

// ---------- Dato (stato iniziale) ----------
Given('che sono sulla pagina di accesso', async ({ page }) => {
  await page.goto('/');
});

Given("che ho effettuato l'accesso", async ({ page }) => {
  await page.goto('/');
  await login(page, 'utente@example.com', 'segreta');
  await expect(ui.productsHeading(page)).toBeVisible();
});

// ---------- Quando (azioni) ----------
When('accedo come {string} con password {string}', async ({ page }, email: string, password: string) => {
  await login(page, email, password);
});

When('aggiungo {string} al carrello', async ({ page }, product: string) => {
  await ui.addButton(page, product).click();
});

When('aggiungo {int} volte {string} al carrello', async ({ page }, times: number, product: string) => {
  for (let i = 0; i < times; i++) await ui.addButton(page, product).click();
});

When('vado al pagamento', async ({ page }) => {
  await page.getByRole('button', { name: 'Vai al pagamento' }).click();
});

// ---------- Allora (verifiche, sempre web-first) ----------
Then('vedo la lista dei prodotti', async ({ page }) => {
  await expect(ui.productsHeading(page)).toBeVisible();
});

Then('non vedo la lista dei prodotti', async ({ page }) => {
  await expect(ui.productsHeading(page)).toBeHidden();
});

Then('vedo il messaggio di benvenuto {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("vedo l'errore {string}", async ({ page }, text: string) => {
  await expect(page.getByRole('alert')).toHaveText(text);
});

Then('il carrello contiene {int} articoli', async ({ page }, count: number) => {
  await expect(ui.cartCount(page)).toHaveText(String(count));
});

Then('il totale è {string} €', async ({ page }, total: string) => {
  await expect(ui.cartTotal(page)).toHaveText(total);
});

Then('vedo lo stato {string}', async ({ page }, text: string) => {
  await expect(page.getByRole('status')).toHaveText(text);
});
