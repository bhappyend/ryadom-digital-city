import { defineConfig } from '@playwright/test';

// Integration owner supplies existing servers. This suite never starts a second app stack.
export default defineConfig({
  testDir: './tests',
  outputDir: `./artifacts/${process.env.QA_RUN_ID ?? 'latest'}/results`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: true,
  reporter: [
    ['list'],
    ['html', { outputFolder: `artifacts/${process.env.QA_RUN_ID ?? 'latest'}/report`, open: 'never' }],
    ['json', { outputFile: `artifacts/${process.env.QA_RUN_ID ?? 'latest'}/results.json` }]
  ],
  use: {
    baseURL: process.env.BASE_URL,
    browserName: 'chromium',
    ...(process.env.QA_BROWSER_CHANNEL ? { channel: process.env.QA_BROWSER_CHANNEL } : {}),
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000
  },
  projects: [
    { name: 'live-api', testMatch: '**/live-api.spec.ts' },
    { name: 'live-ui', testMatch: ['**/live-ui.spec.ts', '**/city-default.spec.ts'] },
    { name: 'mocked-ui', testMatch: '**/mocked-ui.spec.ts' },
    { name: 'pwa', testMatch: '**/pwa.spec.ts', use: { serviceWorkers: 'allow' } }
  ]
});
