/**
 * Fixture Playwright: ogni test (classico o scenario BDD) riceve i page object già pronti,
 * come riceve `page`. Niente `new LoginPage(page)` sparsi nei test.
 *
 *   test('...', async ({ loginPage, shopPage }) => { ... })
 */
// Il `test` di playwright-bdd è il `test` di Playwright con in più ciò che serve agli scenari Gherkin:
// funziona anche nei test classici, quindi una sola base per tutti.
import { test as base } from 'playwright-bdd';
import { LoginPage } from './LoginPage.js';
import { ShopPage } from './ShopPage.js';

type Pages = { loginPage: LoginPage; shopPage: ShopPage };

export const test = base.extend<Pages>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  shopPage: async ({ page }, use) => use(new ShopPage(page)),
});

export { expect } from '@playwright/test';
export { LoginPage, ShopPage };
