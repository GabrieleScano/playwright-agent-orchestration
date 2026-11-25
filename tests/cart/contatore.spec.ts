import { test, expect } from '@playwright/test';

// Test scritto "di fretta": legge il testo una volta sola invece di usare
// un'asserzione che riprova (web-first). Funziona... finché l'app è istantanea.
test.describe('Carrello', () => {
  test('il contatore si aggiorna dopo ogni aggiunta', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill('utente@example.com');
    await page.getByLabel('Password').fill('segreta');
    await page.getByRole('button', { name: 'Entra' }).click();

    await page.getByRole('button', { name: 'Aggiungi Tazza' }).click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    await page.getByRole('button', { name: 'Aggiungi Maglietta' }).click();
    await expect(page.getByTestId('cart-count')).toHaveText('2');
  });
});
