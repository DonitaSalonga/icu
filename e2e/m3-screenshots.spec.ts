// M3 screenshot test (QAD.md T34). Test timings: interval screenshots every 30 s (alarm minimum).
import { resetData, serviceClient } from '../supabase/scripts/testEnv';
import { count, expect, startExam, test, waitForEvents } from './fixtures';

test.beforeEach(async () => {
  await resetData();
});

const shots = async (attemptId: string) =>
  (await serviceClient().from('screenshots').select('id, reason, bytes, storage_path, captured_at').eq('attempt_id', attemptId).order('captured_at')).data ?? [];

test('T34: interval screenshots; a burst of 5 warning events shares one violation screenshot', async ({ context, ext }) => {
  test.setTimeout(240_000);
  const { exam, attemptId, session } = await startExam(context, ext, { warningLimit: 10 });
  await exam.waitForTimeout(65_000);
  const interval = (await shots(attemptId)).filter((s) => s.reason === 'interval');
  expect(interval.length).toBeGreaterThanOrEqual(2);
  expect(interval.length).toBeLessThanOrEqual(3);

  for (let i = 0; i < 5; i++) {
    await exam.evaluate(() => document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true })));
    await exam.waitForTimeout(400);
  }
  const rows = await waitForEvents(attemptId, (r) => count(r, 'paste') === 5, 30_000);
  const { data: pastes } = await serviceClient().from('events').select('screenshot_id').eq('attempt_id', attemptId).eq('type', 'paste');
  const ids = new Set(pastes!.map((p) => p.screenshot_id));
  expect(ids.size).toBe(1);
  expect([...ids][0]).toBeTruthy();
  expect(count(rows, 'screenshot_failed')).toBe(0);

  const all = await shots(attemptId);
  const violation = all.filter((s) => s.reason === 'violation');
  expect(violation).toHaveLength(1);
  expect(violation[0]!.id).toBe([...ids][0]);
  for (const s of all) {
    expect(s.storage_path).toBe(`${session.id}/${attemptId}/${s.id}.jpg`);
    expect(s.bytes).toBeLessThanOrEqual(150_000);
  }
  // The object really exists in Storage.
  const { data: file } = await serviceClient().storage.from('screenshots').download(violation[0]!.storage_path);
  expect(file?.type).toBe('image/jpeg');
  console.log('screenshot sizes (bytes):', all.map((s) => s.bytes).join(', '));
});
