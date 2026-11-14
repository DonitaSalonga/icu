import { defineConfig } from '@playwright/test';
import { TEST_PUBLISHABLE_KEY, TEST_URL } from './supabase/scripts/testEnv';

// E2E tests load the unpacked extension built against icu-test (QAD.md § Test strategy).
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { headless: true },
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: 'node e2e/server.mjs',
      url: 'http://localhost:4173/exam/form.html',
      reuseExistingServer: true,
    },
    {
      // Dashboard against icu-test on its own port (process env overrides .env in Vite).
      command: 'npm run dev -w dashboard -- --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: TEST_URL, VITE_SUPABASE_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY },
    },
  ],
});
