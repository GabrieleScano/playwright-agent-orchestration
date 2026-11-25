import { test } from '@playwright/test';

/**
 * Seed: il punto di partenza che gli agenti (planner/generator) usano per
 * preparare la pagina. Tutto ciò che scrivi qui (login, dati, cookie...)
 * viene eseguito prima che l'agente inizi a esplorare.
 */
test.describe('Mini Shop', () => {
  test('seed', async ({ page }) => {
    await page.goto('/');
  });
});
