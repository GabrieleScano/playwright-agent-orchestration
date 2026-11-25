// spec: specs/mini-shop.md
// seed: tests/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('Login rifiutato con password errata', async ({ page }) => {
    await page.goto('/');

    const email = page.getByRole('textbox', { name: 'Email' });
    const password = page.getByRole('textbox', { name: 'Password' });
    const accedi = page.getByRole('button', { name: 'Accedi' });

    // 1. Inserire email 'utente@example.com' e password 'sbagliata', cliccare 'Accedi'
    await email.fill('utente@example.com');
    await password.fill('sbagliata');
    await accedi.click();

    // Compare l'alert e si resta nella vista di login
    await expect(page.getByRole('alert')).toHaveText('Credenziali non valide');
    await expect(page.getByRole('heading', { name: 'Prodotti' })).toBeHidden();

    // 2. Correggere la password con 'segreta' e cliccare di nuovo 'Accedi'
    await password.fill('segreta');
    await accedi.click();

    // Il login riesce e compare la vista Prodotti
    await expect(page.getByRole('heading', { name: 'Prodotti' })).toBeVisible();
    await expect(page.getByText('Ciao, utente@example.com')).toBeVisible();
  });
});
