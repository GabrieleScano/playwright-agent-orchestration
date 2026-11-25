// spec: specs/mini-shop.md
// seed: tests/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Checkout', () => {
  test('Checkout con carrello vuoto è rifiutato', async ({ page }) => {
    await page.goto('/');

    // 1. Effettuare il login e, senza aggiungere prodotti, cliccare 'Vai al pagamento'
    await page.getByRole('textbox', { name: 'Email' }).fill('utente@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('segreta');
    await page.getByRole('button', { name: 'Accedi' }).click();

    const vaiAlPagamento = page.getByRole('button', { name: 'Vai al pagamento' });
    const stato = page.getByRole('status');
    await vaiAlPagamento.click();

    // Messaggio di carrello vuoto, nessuna conferma; contatore e totale invariati
    await expect(stato).toHaveText('Il carrello è vuoto');
    await expect(page.getByText('Ordine confermato!')).toBeHidden();
    await expect(page.getByText('Articoli: 0')).toBeVisible();
    await expect(page.getByText('Totale: 0.00 €')).toBeVisible();

    // 2. Aggiungere una Tazza e cliccare di nuovo 'Vai al pagamento'
    await page.getByRole('button', { name: 'Aggiungi Tazza' }).click();
    await vaiAlPagamento.click();

    // Il messaggio cambia in 'Ordine confermato!'
    await expect(stato).toHaveText('Ordine confermato!');
    await expect(page.getByText('Il carrello è vuoto')).toBeHidden();
  });
});
