import { test, expect } from '@playwright/test';

test.describe('Mini Shop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('login con password errata mostra un errore', async ({ page }) => {
    await page.getByLabel('Email').fill('gabri@example.com');
    await page.getByLabel('Password').fill('sbagliata');
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page.getByRole('alert')).toHaveText('Credenziali non valide');
  });

  test('utente aggiunge prodotti e conclude l\'ordine', async ({ page }) => {
    await page.getByLabel('Email').fill('gabri@example.com');
    await page.getByLabel('Password').fill('segreta');
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page.getByRole('heading', { name: 'Prodotti' })).toBeVisible();
    await page.getByRole('button', { name: 'Aggiungi Tazza' }).click();
    await page.getByRole('button', { name: 'Aggiungi Quaderno' }).click();

    await expect(page.getByTestId('cart-count')).toHaveText('2');
    await expect(page.getByTestId('cart-total')).toHaveText('12.75');

    await page.getByRole('button', { name: 'Vai al pagamento' }).click();
    await expect(page.getByRole('status')).toHaveText('Ordine confermato!');
  });
});
