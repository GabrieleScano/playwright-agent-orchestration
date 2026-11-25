import { defineConfig, devices } from '@playwright/test';

// Porta dell'app demo. 4310 è poco usata (3000, 4173, 5173, 8080 sono spesso occupate da altri progetti).
// Per cambiarla: PORT=5000 npx playwright test
const PORT = process.env.PORT ?? '4310';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    actionTimeout: 5_000,
    // Opzionale: usa un Chromium già installato (es. in ambienti senza download).
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH, chromiumSandbox: false }
      : {},
  },
  // Playwright avvia da solo l'app demo prima dei test.
  webServer: {
    command: 'node demo-app/server.mjs',
    url: BASE_URL,
    env: { PORT },
    // false: se la porta è già occupata (da un altro progetto o da `npm run demo`),
    // Playwright si ferma con un errore chiaro invece di testare l'app sbagliata.
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
