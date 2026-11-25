import { test, expect } from '../../pages/fixtures.js';

// Test classico (non BDD) che usa gli stessi page object degli scenari Gherkin:
// un bottone rinominato si corregge in pages/, una volta per tutti.
test.describe('Carrello', () => {
  test('il contatore si aggiorna dopo ogni aggiunta', async ({ loginPage, shopPage }) => {
    await loginPage.loginAsDefaultUser();

    await shopPage.add('Tazza');
    await expect(shopPage.cart.count).toHaveText('1');

    await shopPage.add('Maglietta');
    await expect(shopPage.cart.count).toHaveText('2');
  });
});
