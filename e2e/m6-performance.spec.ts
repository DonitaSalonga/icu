// T42 (R29): content-script handler cost and candidate-review render time for a 1-hour attempt.
// Bundle-size budgets are checked from the build output (docs/BUILD.md M6 log).
import { randomUUID } from 'node:crypto';
import { clientAs, resetData, serviceClient } from '../supabase/scripts/testEnv';
import { DASH, login } from './dashboard-helpers';
import { expect, startExam, test } from './fixtures';

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

test.beforeEach(async () => {
  await resetData();
});

test('T42: clipboard listeners on the exam page cost ≤ 5 ms per event', async ({ context, ext }) => {
  const { exam } = await startExam(context, ext, { warningLimit: 10 });
  await exam.waitForTimeout(1500);
  // dispatchEvent is synchronous: it includes the content script's listener (and the page's, none here).
  const timings = await exam.evaluate(() => {
    const out: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      document.dispatchEvent(new ClipboardEvent(i % 2 ? 'copy' : 'contextmenu', { bubbles: true }));
      out.push(performance.now() - t0);
    }
    return out;
  });
  const max = Math.max(...timings);
  console.log(`[perf] handler max ${max.toFixed(2)} ms, mean ${(timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(3)} ms`);
  expect(max).toBeLessThanOrEqual(5);
});

test('T42: candidate review is interactive within 2 s for a 1-hour attempt', async ({ page }) => {
  test.setTimeout(300_000);
  const db = serviceClient();
  const admin = await clientAs('adminA');
  const student = await clientAs('student1');
  const session = (await admin.rpc('create_session', { p_name: 'Perf', p_url_patterns: ['https://a.com/*'], p_starts_at: new Date(Date.now() - 2 * 3600_000).toISOString(), p_ends_at: new Date(Date.now() + 3600_000).toISOString() })).data as { id: string; code: string };
  const attemptId = (await student.rpc('join_session', { p_code: session.code })).data.attempt_id as string;
  await student.rpc('start_attempt', { p_attempt_id: attemptId, p_consent_version: 't', p_age_confirmed: true });
  const started = Date.now() - 65 * 60_000;
  const at = (s: number) => new Date(started + s * 1000).toISOString();
  await db.from('attempts').update({ started_at: at(0), ended_at: at(3600), status: 'ended' }).eq('id', attemptId);

  // 60 screenshots, 200 events, 240 heartbeats.
  const shotIds: string[] = [];
  await Promise.all(
    Array.from({ length: 60 }, async (_, i) => {
      const id = randomUUID();
      shotIds[i] = id;
      const path = `${session.id}/${attemptId}/${id}.jpg`;
      await db.storage.from('screenshots').upload(path, JPEG, { contentType: 'image/jpeg' });
      await db.from('screenshots').insert({ id, attempt_id: attemptId, storage_path: path, captured_at: at(i * 60), reason: 'interval', bytes: JPEG.length });
    }),
  );
  const types = ['exam_tab_hidden', 'exam_tab_visible', 'url_visited', 'copy', 'paste'];
  await db.from('events').insert(
    Array.from({ length: 200 }, (_, i) => ({ id: randomUUID(), attempt_id: attemptId, type: types[i % types.length], occurred_at: at(i * 18), details: { away_ms: 1000, host: 'example.com', path: '/' }, screenshot_id: i % 4 === 0 ? shotIds[Math.floor(i / 4) % 60] : null })),
  );
  const { data: hb } = await db.from('heartbeats').insert(Array.from({ length: 240 }, () => ({ attempt_id: attemptId }))).select('id');
  for (let i = 0; i < hb!.length; i += 20) {
    await Promise.all(hb!.slice(i, i + 20).map((h, j) => db.from('heartbeats').update({ received_at: at((i + j) * 15) }).eq('id', h.id)));
  }

  await login(page);
  const t0 = Date.now();
  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attemptId}`);
  await expect(page.getByText('Risk breakdown')).toBeVisible();
  await expect(page.locator('ol > li')).toHaveCount(200, { timeout: 10_000 });
  const ms = Date.now() - t0;
  console.log(`[perf] candidate review interactive in ${ms} ms (200 events, 240 heartbeats, 60 screenshots)`);
  expect(ms).toBeLessThanOrEqual(2000);
});
