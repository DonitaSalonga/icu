// Builds the extension against the icu-test project with test timings, and seeds test users.
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { seedUsers, TEST_PUBLISHABLE_KEY, TEST_URL, testEnvConfigured } from '../supabase/scripts/testEnv';

export default async function globalSetup() {
  if (!testEnvConfigured) throw new Error('E2E needs .env.test (see .env.test.example).');
  execSync('npx wxt build --mode e2e', {
    cwd: join(import.meta.dirname, '../extension'),
    stdio: 'inherit',
    env: { ...process.env, WXT_SUPABASE_URL: TEST_URL, WXT_SUPABASE_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY, WXT_ICU_TEST_TIMINGS: '1', WXT_DASHBOARD_URL: 'http://localhost:5174' },
  });
  await seedUsers();
}
