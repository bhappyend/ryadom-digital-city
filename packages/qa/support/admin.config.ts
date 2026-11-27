import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Explicit invocation only; the existing stage-1 QA projects remain unchanged.
export default defineConfig({
  testDir: '../tests',
  testMatch: 'admin*.spec.ts',
  outputDir: `../artifacts/${process.env.QA_RUN_ID ?? 'admin-latest'}/results`,
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: true,
  timeout: 45_000, expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(__dirname, `../artifacts/${process.env.QA_RUN_ID ?? 'admin-latest'}/results.json`) }]
  ],
  use: {
    browserName: 'chromium', baseURL: process.env.BASE_URL,
    serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    actionTimeout: 10_000
  },
  projects: [
    { name: 'admin-public', testMatch: 'admin-public.spec.ts' },
    { name: 'admin-demo', testMatch: 'admin-demo.spec.ts' }
  ]
});
