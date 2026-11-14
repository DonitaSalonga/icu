// Test-project access for integration tests and seed/reset scripts (QAD.md § Environments and test data).
// The secret key is used ONLY here, never in the extension or dashboard (R25, RESEARCH F14).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function loadEnvTest(): Record<string, string> {
  try {
    const text = readFileSync(join(import.meta.dirname, '../../.env.test'), 'utf8');
    return Object.fromEntries(
      text.split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnvTest(), ...process.env } as Record<string, string | undefined>;
export const TEST_URL = env.SUPABASE_TEST_URL ?? '';
export const TEST_PUBLISHABLE_KEY = env.SUPABASE_TEST_PUBLISHABLE_KEY ?? '';
const TEST_SECRET_KEY = env.SUPABASE_TEST_SECRET_KEY ?? '';
export const TEST_PASSWORD = env.TEST_USER_PASSWORD ?? '';
export const testEnvConfigured = Boolean(TEST_URL && TEST_PUBLISHABLE_KEY && TEST_SECRET_KEY && TEST_PASSWORD);

export const TEST_USERS = {
  adminA: { email: 'admin-a@test.local', role: 'admin', full_name: 'Admin A' },
  adminB: { email: 'admin-b@test.local', role: 'admin', full_name: 'Admin B' },
  student1: { email: 'student-1@test.local', role: 'student', full_name: 'Student One' },
  student2: { email: 'student-2@test.local', role: 'student', full_name: 'Student Two' },
} as const;
export type TestUser = keyof typeof TEST_USERS;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function serviceClient(): SupabaseClient {
  return createClient(TEST_URL, TEST_SECRET_KEY, noSession);
}

/** A client signed in as one of the seeded users, subject to RLS like the real apps. */
export async function clientAs(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(TEST_URL, TEST_PUBLISHABLE_KEY, noSession);
  const { error } = await client.auth.signInWithPassword({ email: TEST_USERS[user].email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in as ${user} failed: ${error.message}`);
  return client;
}

/** Idempotent: creates the seeded users if missing (QAD seed:test). */
export async function seedUsers(): Promise<void> {
  const admin = serviceClient().auth.admin;
  const { data, error } = await admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = new Set(data.users.map((u) => u.email));
  for (const u of Object.values(TEST_USERS)) {
    if (existing.has(u.email)) continue;
    const { error: createError } = await admin.createUser({
      email: u.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role: u.role, full_name: u.full_name },
    });
    if (createError) throw createError;
  }
}

/** Deletes all monitoring data and sessions, keeps users (QAD reset:test). */
export async function resetData(): Promise<void> {
  const db = serviceClient();
  // Children first. Each filter matches every row (PostgREST requires a filter on delete).
  const deletes = [
    db.from('events').delete().not('id', 'is', null),
    db.from('heartbeats').delete().gte('id', 0),
  ];
  for (const { error } of await Promise.all(deletes)) if (error) throw new Error(`reset: ${error.message}`);
  await emptyScreenshotBucket();
  for (const table of ['screenshots', 'attempts', 'exam_sessions']) {
    const { error } = await db.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`reset ${table}: ${error.message}`);
  }
}

/** Removes every object in the screenshots bucket (session/attempt/file.jpg layout). */
async function emptyScreenshotBucket(): Promise<void> {
  const bucket = serviceClient().storage.from('screenshots');
  const { data: sessions, error } = await bucket.list('', { limit: 1000 });
  if (error) {
    if (/not found/i.test(error.message)) return; // bucket not created yet (before migration 003)
    throw error;
  }
  for (const s of sessions) {
    const { data: attempts } = await bucket.list(s.name, { limit: 1000 });
    for (const a of attempts ?? []) {
      const { data: files } = await bucket.list(`${s.name}/${a.name}`, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${s.name}/${a.name}/${f.name}`);
      if (paths.length) await bucket.remove(paths);
    }
  }
}
