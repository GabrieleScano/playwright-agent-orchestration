// spec: specs/mini-shop.md
// seed: tests/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Carrello', () => {
  // BUG APP: il totale del carrello arrotonda i prezzi per difetto (Math.floor in
  // demo-app/public/app.js): mostra 12.00 invece di 12.75. Riabilitare dopo il fix dell'app.
  test.fixme('Aggiunta dello stesso prodotto più volte', async ({ page }) => {
    await page.goto('/');

    // 1. Effettuare il login e cliccare 'Aggiungi Quaderno' 3 volte
    await page.getByRole('textbox', { name: 'Email' }).fill('utente@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('segreta');
    await page.getByRole('button', { name: 'Entra' }).click();

    const aggiungiQuaderno = page.getByRole('button', { name: 'Aggiungi Quaderno' });
    await aggiungiQuaderno.click();
    await aggiungiQuaderno.click();
    await aggiungiQuaderno.click();

    // Contatore a 3 e totale 12.75 (nessun errore di arrotondamento)
    await expect(page.getByText('Articoli: 3')).toBeVisible();
    await expect(page.getByText('Totale: 12.75 €')).toBeVisible();

    // 2. Cliccare 'Aggiungi Maglietta' 2 volte aggiuntive
    const aggiungiMaglietta = page.getByRole('button', { name: 'Aggiungi Maglietta' });
    await aggiungiMaglietta.click();
    await aggiungiMaglietta.click();

    // Contatore a 5 e totale 52.55
    await expect(page.getByText('Articoli: 5')).toBeVisible();
    await expect(page.getByText('Totale: 52.55 €')).toBeVisible();
  });
});
