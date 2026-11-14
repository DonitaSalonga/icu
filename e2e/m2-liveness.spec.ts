// M2 liveness tests (QAD.md T33, T38). The T28 window part is in m2-window.spec.ts (headed). T33 uses real timing (15 s heartbeat, 60 s gap).
import type { Worker } from '@playwright/test';
import { findGaps } from '@icu/core';
import { resetData, serviceClient, TEST_URL } from '../supabase/scripts/testEnv';
import { count, events, EXAM_URL, expect, heartbeats, startExam, test, waitForEvents } from './fixtures';

const examIds = (worker: Worker) =>
  worker.evaluate(async () => {
    const a = (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as { exam_tab_id?: number; exam_window_id?: number };
    return { tabId: a.exam_tab_id, windowId: a.exam_window_id };
  });

test.beforeEach(async () => {
  await resetData();
});

test('T33 (part): heartbeat every 15 ± 5 s; closing the exam tab for 75 s leaves one gap', async ({ context, ext }) => {
  test.setTimeout(300_000);
  const { exam, attemptId } = await startExam(context, ext);
  await exam.waitForTimeout(65_000);

  const normal = (await heartbeats(attemptId)).map((h) => Date.parse(h.received_at));
  expect(normal.length).toBeGreaterThanOrEqual(4);
  for (let i = 1; i < normal.length; i++) {
    expect(normal[i]! - normal[i - 1]!).toBeGreaterThan(9_000);
    expect(normal[i]! - normal[i - 1]!).toBeLessThan(21_000);
  }

  await exam.close();
  await new Promise((r) => setTimeout(r, 75_000));
  const reopened = await context.newPage();
  await reopened.goto(EXAM_URL);
  await reopened.waitForTimeout(20_000);

  const { data: attempt } = await serviceClient().from('attempts').select('started_at').eq('id', attemptId).single();
  const beats = (await heartbeats(attemptId)).map((h) => new Date(h.received_at));
  const gaps = findGaps(beats, new Date(attempt!.started_at), new Date());
  expect(gaps).toHaveLength(1);
  expect(gaps[0]!.durationMs).toBeGreaterThan(75_000);
  expect(gaps[0]!.durationMs).toBeLessThan(100_000);
});

test('T38: events made while uploads fail are kept and uploaded later with their original times', async ({ context, ext }) => {
  const { exam, attemptId } = await startExam(context, ext, { warningLimit: 10 });
  await exam.waitForTimeout(1500);

  // Block event uploads from the extension (service-worker requests go through the context router).
  await context.route(`${TEST_URL}/rest/v1/events*`, (route) => route.abort('internetdisconnected'));
  const before = Date.now();
  await exam.evaluate(() => document.dispatchEvent(new ClipboardEvent('copy', { bubbles: true })));
  await exam.waitForTimeout(8_000);
  expect(count(await events(attemptId), 'copy'), 'route did not block the service worker').toBe(0);

  await context.unroute(`${TEST_URL}/rest/v1/events*`);
  const rows = await waitForEvents(attemptId, (r) => count(r, 'copy') === 1, 60_000);
  const copy = rows.find((r) => r.type === 'copy')!;
  expect(Math.abs(Date.parse(copy.occurred_at) - before)).toBeLessThan(5_000);
});
