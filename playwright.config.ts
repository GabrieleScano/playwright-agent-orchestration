import { release } from 'node:os';
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

/**
 * Browser da usare.
 * Playwright non scarica più il suo Chromium per macOS 13 o precedenti (Darwin < 23):
 * lì usiamo il Google Chrome già installato sul computer (channel "chrome").
 * Si può forzare con PW_CHANNEL, es. PW_CHANNEL=chrome oppure PW_CHANNEL=msedge.
 */
const oldMac = process.platform === 'darwin' && Number(release().split('.')[0]) < 23;
const CHANNEL = process.env.PW_CHANNEL ?? (oldMac ? 'chrome' : undefined);

// Porta dell'app demo. 4310 è poco usata (3000, 4173, 5173, 8080 sono spesso occupate da altri progetti).
// Per cambiarla: PORT=5000 npx playwright test
const PORT = process.env.PORT ?? '4310';
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Passo 7 – BDD con playwright-bdd.
 * I file .feature (Gherkin) vengono tradotti in test Playwright normali dentro .features-gen/
 * dal comando `npx bddgen`. Per questo `npm test` e `npm run test:ui` lanciano bddgen prima di Playwright.
 */
const bddTestDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'features/steps/**/*.ts',
  language: 'it',
});

const browser = { ...devices['Desktop Chrome'], ...(CHANNEL ? { channel: CHANNEL } : {}) };

export default defineConfig({
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
  projects: [
    // Test "classici" scritti in TypeScript (seed per gli agenti, demo dei flaky).
    { name: 'chromium', testDir: './tests', use: browser },
    // Scenari BDD: i requisiti in italiano in features/*.feature.
    { name: 'bdd', testDir: bddTestDir, use: browser },
  ],
});
