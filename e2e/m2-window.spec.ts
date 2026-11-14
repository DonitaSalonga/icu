// QAD.md T28 (window part). Runs headed: headless Chromium doesn't emit the focus-return event
// (verified 2026-11-14), so a browser window briefly appears while this test runs.
import type { Worker } from '@playwright/test';
import { resetData } from '../supabase/scripts/testEnv';
import { count, events, expect, OTHER_URL, startExam, test, waitForEvents } from './fixtures';

test.use({ headless: false });
// Real OS window focus can be taken by any other app during a long suite run; it failed once in a
// full run (2026-11-14) and passed 3/3 alone. Retries apply to this file only.
test.describe.configure({ retries: 2 });

const examIds = (worker: Worker) =>
  worker.evaluate(async () => {
    const a = (await chrome.storage.local.get('ocm-attempt'))['ocm-attempt'] as { exam_tab_id?: number; exam_window_id?: number };
    return { tabId: a.exam_tab_id, windowId: a.exam_window_id };
  });

test.beforeEach(async () => {
  await resetData();
});

test('T28 (window): switching to another browser window and back', async ({ context, ext, worker }) => {
  const { attemptId } = await startExam(context, ext);
  await expect.poll(async () => (await examIds(worker)).windowId, { timeout: 10_000 }).toBeDefined();
  const { windowId } = await examIds(worker);
  // Leave fullscreen first: on macOS a window opened from a fullscreen window bounces focus back.
  await worker.evaluate((id) => chrome.windows.update(id, { state: 'normal' }), windowId!);
  await new Promise((r) => setTimeout(r, 2000));
  const before = await events(attemptId);

  await worker.evaluate((url) => chrome.windows.create({ url, focused: true, state: 'normal' }), OTHER_URL);
  await new Promise((r) => setTimeout(r, 3000));
  await worker.evaluate((id) => chrome.windows.update(id, { focused: true }), windowId!);

  const rows = await waitForEvents(attemptId, (r) => count(r, 'window_focus') > count(before, 'window_focus'), 15_000);
  expect(count(rows, 'window_blur')).toBe(count(before, 'window_blur') + 1);
  const away = Number(rows.filter((r) => r.type === 'window_focus').at(-1)!.details.away_ms);
  expect(away).toBeGreaterThan(2000);
  expect(away).toBeLessThan(5000);
});
