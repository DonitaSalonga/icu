import { defineConfig } from '@playwright/test';

// E2E tests load the unpacked extension built against ocm-test (QAD.md § Test strategy).
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { headless: true },
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'node e2e/server.mjs',
    url: 'http://localhost:4173/exam/form.html',
    reuseExistingServer: true,
  },
});
