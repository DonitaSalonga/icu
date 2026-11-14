// M4 dashboard tests (QAD.md T39, T40) against ocm-test. Data is seeded through the API as a student.
import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { clientAs, resetData, serviceClient, TEST_PASSWORD, TEST_USERS } from '../supabase/scripts/testEnv';

const test = base;
const DASH = 'http://localhost:5174';
const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
// A real 2×2 JPEG so the browser can render it.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

async function seed() {
  await resetData();
  const admin = await clientAs('adminA');
  const session = (await admin.rpc('create_session', { p_name: 'Seeded quiz', p_url_patterns: ['https://docs.google.com/forms/*'], p_starts_at: minutes(-30), p_ends_at: minutes(60) })).data as { id: string; code: string };
  const db = serviceClient();
  const attempts: Record<string, string> = {};
  for (const who of ['student1', 'student2'] as const) {
    const s = await clientAs(who);
    const attemptId = (await s.rpc('join_session', { p_code: session.code })).data.attempt_id as string;
    await db.from('attempts').update({ status: 'ended' }).eq('status', 'active').neq('id', attemptId);
    await s.rpc('start_attempt', { p_attempt_id: attemptId, p_consent_version: 't', p_age_confirmed: true });
    attempts[who] = attemptId;
  }
  const started = new Date(Date.now() - 20 * 60_000);
  const ended = new Date(Date.now() - 10 * 60_000);
  for (const attemptId of Object.values(attempts)) {
    await db.from('attempts').update({ started_at: started.toISOString(), ended_at: ended.toISOString(), status: 'ended', end_reason: 'student' }).eq('id', attemptId);
  }
  const at = (s: number) => new Date(started.getTime() + s * 1000).toISOString();

  // student1: High — tab switches, a paste with a screenshot, a 3-minute gap (score 15) and the warning limit (forces High).
  const shotId = randomUUID();
  const path = `${session.id}/${attempts.student1}/${shotId}.jpg`;
  await db.storage.from('screenshots').upload(path, JPEG, { contentType: 'image/jpeg' });
  await db.from('screenshots').insert({ id: shotId, attempt_id: attempts.student1, storage_path: path, captured_at: at(60), reason: 'violation', bytes: JPEG.length });
  const ev = (attempt: string, type: string, s: number, details = {}, screenshot_id: string | null = null) => ({ id: randomUUID(), attempt_id: attempt, type, occurred_at: at(s), details, screenshot_id });
  await db.from('events').insert([
    ev(attempts.student1!, 'fullscreen_enter', 1),
    ev(attempts.student1!, 'exam_tab_hidden', 60, {}, shotId),
    ev(attempts.student1!, 'url_visited', 61, { host: 'chatgpt.com', path: '/c/1' }),
    ev(attempts.student1!, 'exam_tab_visible', 90, { away_ms: 30000 }),
    ev(attempts.student1!, 'paste', 95, {}, shotId),
    ev(attempts.student1!, 'exam_tab_hidden', 200),
    ev(attempts.student1!, 'exam_tab_visible', 230, { away_ms: 30000 }),
    ev(attempts.student1!, 'warning_limit_reached', 231, { limit: 3 }),
    ev(attempts.student2!, 'fullscreen_enter', 1),
    ev(attempts.student2!, 'copy', 100),
  ]);
  // Heartbeats every 15 s for both; student1 has a hole from 300 s to 480 s.
  for (const [who, attemptId] of Object.entries(attempts)) {
    for (let s = 0; s <= 600; s += 15) {
      if (who === 'student1' && s > 300 && s < 480) continue;
      const { data } = await db.from('heartbeats').insert({ attempt_id: attemptId }).select('id').single();
      await db.from('heartbeats').update({ received_at: at(s) }).eq('id', data!.id);
    }
  }
  return { session, attempts };
}

async function login(page: Page) {
  await page.goto(`${DASH}/login`);
  await page.getByLabel('Email').fill(TEST_USERS.adminA.email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Exam sessions' })).toBeVisible();
}

test('T39: create a session; triage by risk; review timeline, filters, breakdown, screenshots', async ({ page }) => {
  const { session } = await seed();
  await login(page);

  // Create a session through the dialog.
  await page.getByRole('button', { name: 'Create session' }).first().click();
  await page.getByLabel('Name').fill('Created in E2E');
  await page.getByRole('dialog').getByRole('button', { name: 'Create session' }).click();
  const status = page.getByRole('status').filter({ hasText: 'Created in E2E' });
  await expect(status).toBeVisible();
  const code = (await status.locator('.font-mono').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await expect(page.getByRole('row', { name: /Created in E2E/ })).toContainText(code);

  // Session detail: High candidate first.
  await page.getByRole('link', { name: 'Seeded quiz' }).click();
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Student One');
  await expect(rows.nth(0)).toContainText('High');
  await expect(rows.nth(1)).toContainText('Student Two');
  await expect(rows.nth(1)).toContainText('Low');

  // Candidate review.
  await page.getByRole('link', { name: 'Student One' }).click();
  await expect(page.getByRole('heading', { name: 'Student One' })).toBeVisible();
  const items = page.locator('ol > li');
  await expect(page.locator('ol > li', { hasText: 'Monitoring lost' })).toHaveCount(1);
  await expect(page.locator('ol > li', { hasText: 'Monitoring lost' })).toContainText('3 min 0 s');
  const times = await items.locator('time').allTextContents();
  expect([...times].sort()).toEqual(times);
  await expect(page.getByText('Visited chatgpt.com/c/1')).toBeVisible();

  // Breakdown total equals the badge score: 2+2 (left tab) + 3 (paste) + 8 (gap) = 15; the limit forces High.
  const total = page.locator('section', { hasText: 'Risk breakdown' }).getByRole('row', { name: /Total/ });
  await expect(total).toContainText('15');
  await expect(page.locator('main header')).toContainText('High· 15');
  await expect(page.getByText(/warning limit was reached/)).toBeVisible();

  // Filters: hide "Left exam tab" without reloading.
  await page.getByRole('button', { name: /Left exam tab · 2/ }).click();
  await expect(page.locator('ol > li', { hasText: /^.*Left exam tab$/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Left exam tab · 2/ }).click();

  // Screenshot from an event shows its linked events.
  await page.locator('ol > li', { hasText: 'Pasted on exam page' }).getByRole('button', { name: 'Screenshot' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img')).toBeVisible();
  await expect(dialog).toContainText('Left exam tab');
  await expect(dialog).toContainText('Pasted on exam page');
  expect(session.id).toBeTruthy();
});

test('T40: verdict save and change; delete data with typed confirmation', async ({ page }) => {
  const { session, attempts } = await seed();
  await login(page);
  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);

  await page.getByLabel('Suspicious').check();
  await page.getByLabel('Note (optional)').fill('Visited ChatGPT during the exam');
  const saved = () => page.waitForResponse((r) => r.url().includes('/rpc/set_verdict') && r.ok());
  await Promise.all([saved(), page.getByRole('button', { name: 'Save verdict' }).click()]);
  await expect(page.getByRole('status').filter({ hasText: 'Verdict saved.' })).toBeVisible();
  await page.getByLabel('Cheating confirmed').check();
  await Promise.all([saved(), page.getByRole('button', { name: 'Save verdict' }).click()]);
  await page.goto(`${DASH}/sessions/${session.id}`);
  await expect(page.locator('tbody tr').first()).toContainText('Cheating confirmed');

  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);
  await page.getByRole('button', { name: 'Delete candidate data' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await confirm.getByLabel('Type DELETE to confirm').fill('DELETE');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/Data deleted on/)).toBeVisible();
  await expect(page.getByText('No screenshots.')).toBeVisible();
  const { data: left } = await serviceClient().storage.from('screenshots').list(`${session.id}/${attempts.student1}`);
  expect(left).toEqual([]);
});
