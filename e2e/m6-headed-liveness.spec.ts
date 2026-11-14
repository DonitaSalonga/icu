// Headed liveness tests: T33 (extension disabled mid-exam, via chrome://extensions) and T51
// (hidden-tab timer throttling over 6+ minutes). Slow; run with ICU_E2E_SLOW=1. A browser window
// appears while these run.
import { findGaps } from '@icu/core';
import { resetData, serviceClient } from '../supabase/scripts/testEnv';
import { EXAM_URL, expect, heartbeats, OTHER_URL, startExam, test } from './fixtures';

test.use({ headless: false });
test.skip(!process.env.ICU_E2E_SLOW, 'set ICU_E2E_SLOW=1 to run');

test.beforeEach(async () => {
  await resetData();
});

const gapsOf = async (attemptId: string) => {
  const { data: a } = await serviceClient().from('attempts').select('started_at').eq('id', attemptId).single();
  return findGaps((await heartbeats(attemptId)).map((h) => new Date(h.received_at)), new Date(a!.started_at), new Date());
};

test('T33: disabling the extension for 90 s leaves one gap; re-enabling resumes page heartbeats (re-injection)', async ({ context, ext, extensionId }) => {
  test.setTimeout(300_000);
  const { exam, attemptId } = await startExam(context, ext);
  await exam.waitForTimeout(20_000);

  const settings = await context.newPage();
  await settings.goto(`chrome://extensions/?id=${extensionId}`);
  const toggle = settings.locator('extensions-detail-view #enableToggle');
  await toggle.click();
  await expect.poll(() => toggle.evaluate((el) => (el as HTMLInputElement).checked)).toBe(false);
  const disabledAt = Date.now();
  await settings.waitForTimeout(90_000);
  await toggle.click();
  await expect.poll(() => toggle.evaluate((el) => (el as HTMLInputElement).checked)).toBe(true);
  await settings.close();
  await exam.bringToFront();
  await exam.waitForTimeout(40_000);

  const gaps = await gapsOf(attemptId);
  expect(gaps).toHaveLength(1);
  expect(gaps[0]!.durationMs).toBeGreaterThan(85_000);
  expect(gaps[0]!.durationMs).toBeLessThan(140_000);
  const after = (await heartbeats(attemptId)).filter((h) => Date.parse(h.received_at) > disabledAt + 90_000);
  console.log(`[T33] after re-enable: ${after.map((h) => h.source).join(',')}`);
  const fromPage = after.filter((h) => h.source === 'content');
  console.log(`[T33] gap ${Math.round(gaps[0]!.durationMs / 1000)} s; page heartbeats after re-enable: ${fromPage.length}`);
  expect(fromPage.length).toBeGreaterThanOrEqual(1);
});

test('T51: the exam tab hidden for 6.5 minutes leaves no gap (page heartbeats, with the 30 s alarm as backup)', async ({ context, ext, worker }) => {
  test.setTimeout(600_000);
  const { exam, attemptId } = await startExam(context, ext);
  await exam.waitForTimeout(5_000);
  const ids = await worker.evaluate(async () => (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as { exam_window_id: number });
  await worker.evaluate(({ url, windowId }) => chrome.tabs.create({ url, windowId, active: true }), { url: OTHER_URL, windowId: ids.exam_window_id });
  await new Promise((r) => setTimeout(r, 390_000));

  const gaps = await gapsOf(attemptId);
  const hb = await heartbeats(attemptId);
  console.log(`[T51] heartbeats ${hb.length} (content ${hb.filter((h) => h.source === 'content').length}, alarm ${hb.filter((h) => h.source === 'alarm').length}); gaps ${gaps.length}`);
  expect(gaps).toEqual([]);
  expect(EXAM_URL).toBeTruthy();
});
