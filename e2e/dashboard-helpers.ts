// Shared dashboard E2E helpers: seeded review data and admin login (used by M4 and M6 specs).
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { clientAs, resetData, serviceClient, TEST_PASSWORD, TEST_USERS } from '../supabase/scripts/testEnv';

export const DASH = 'http://localhost:5174';
const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
// A real 2×2 JPEG so the browser can render it.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

export async function seed() {
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

export async function login(page: Page) {
  await page.goto(`${DASH}/login`);
  await page.getByLabel('Email').fill(TEST_USERS.adminA.email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toBeVisible(); // Overview greets the admin
}
