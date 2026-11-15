// 2026-11-15 feedback (third round): every tab switch has its own screenshot showing the tab switched to,
// and fullscreen is reached and its exit recorded even when Chrome reports the change late or not at all.
import { resetData, serviceClient } from '../supabase/scripts/testEnv';
import { count, events, expect, OTHER_URL, startExam, test, waitForEvents, type ExtensionDriver } from './fixtures';

test.beforeEach(async () => {
  await resetData();
});

type Stored = { exam_tab_id: number; exam_window_id: number; monitor_tab_id: number; window_state?: string; fullscreen_seen?: boolean };
const stored = (ext: ExtensionDriver) => ext.inWorker(async () => (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as Stored);
async function setStored(worker: import('@playwright/test').Worker, patch: Record<string, unknown>) {
  await worker.evaluate(async (p) => {
    const a = (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as object;
    await chrome.storage.local.set({ 'icu-attempt': { ...a, ...p } });
  }, patch);
}

const eventShot = async (attemptId: string, type: string, nth = 0) => {
  const { data } = await serviceClient().from('events').select('occurred_at, screenshot_id').eq('attempt_id', attemptId).eq('type', type).order('occurred_at');
  const ev = data?.[nth];
  if (!ev?.screenshot_id) return { ev, shot: undefined };
  const { data: shot } = await serviceClient().from('screenshots').select('id, reason, captured_at, visible_path, storage_path').eq('id', ev.screenshot_id).single();
  return { ev, shot };
};

test('T62: each tab switch gets its own screenshot of the tab switched to, taken after it is on screen', async ({ context, ext, worker }) => {
  const { attemptId } = await startExam(context, ext, { warningLimit: 10 });
  await expect.poll(async () => (await stored(ext))?.exam_tab_id, { timeout: 10_000 }).toBeDefined();
  const { exam_tab_id: examTab, exam_window_id: windowId } = await stored(ext);
  await new Promise((r) => setTimeout(r, 1500));

  // Leave the exam for another site. The warning shows at once (it isn't held back for the screenshot).
  const { other, warnedAfterMs } = await worker.evaluate(async ({ url, windowId }) => {
    const t0 = Date.now();
    const other = await chrome.tabs.create({ url, windowId, active: true });
    while (Date.now() - t0 < 5000) {
      if (Object.keys(await chrome.notifications.getAll()).some((k) => k.startsWith('icu-warning-'))) return { other, warnedAfterMs: Date.now() - t0 };
      await new Promise((r) => setTimeout(r, 20));
    }
    return { other, warnedAfterMs: -1 };
  }, { url: OTHER_URL, windowId });
  expect(warnedAfterMs).toBeGreaterThanOrEqual(0);
  expect(warnedAfterMs).toBeLessThan(450);
  await waitForEvents(attemptId, (r) => count(r, 'exam_tab_hidden') === 1 && count(r, 'url_visited') === 1);
  const left = await eventShot(attemptId, 'exam_tab_hidden');
  expect(left.shot).toMatchObject({ reason: 'tab_switch', visible_path: '/other/page.html' });
  expect(Date.parse(left.shot!.captured_at) - Date.parse(left.ev!.occurred_at)).toBeGreaterThanOrEqual(400);
  // The site visit reuses that same picture.
  expect((await eventShot(attemptId, 'url_visited')).shot?.id).toBe(left.shot!.id);

  // Back to the exam: its own screenshot, of the exam.
  await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), examTab);
  await waitForEvents(attemptId, (r) => count(r, 'exam_tab_visible') === 1);
  const back = await eventShot(attemptId, 'exam_tab_visible');
  expect(back.shot).toMatchObject({ reason: 'tab_switch', visible_path: '/exam/form.html' });
  expect(back.shot!.id).not.toBe(left.shot!.id);

  // And away again, to the already-open tab: another new screenshot.
  await new Promise((r) => setTimeout(r, 1000));
  await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), other.id!);
  await waitForEvents(attemptId, (r) => count(r, 'exam_tab_hidden') === 2);
  const again = await eventShot(attemptId, 'exam_tab_hidden', 1);
  expect(again.shot).toMatchObject({ reason: 'tab_switch', visible_path: '/other/page.html' });
  expect(new Set([left.shot!.id, back.shot!.id, again.shot!.id]).size).toBe(3);
  expect(count(await events(attemptId), 'screenshot_failed')).toBe(0);
});

test('T63: the picture shows the tab switched to, not the exam (pixel check)', async ({ context, ext, worker }) => {
  const { exam, attemptId, monitor } = await startExam(context, ext, { warningLimit: 10 });
  await expect.poll(async () => (await stored(ext))?.exam_tab_id, { timeout: 10_000 }).toBeDefined();
  const { exam_window_id: windowId } = await stored(ext);
  // Without a screen share, screenshots are of the browser tab, which a headless test can inspect
  // (the whole-screen share shows the real screen of the machine running the tests).
  await monitor.close();
  await waitForEvents(attemptId, (r) => count(r, 'screen_share_stopped') === 1);
  await exam.evaluate(() => (document.body.style.background = 'rgb(220, 0, 0)'));
  const opened = context.waitForEvent('page', (p) => p.url() === OTHER_URL);
  const tab = await worker.evaluate(({ url, windowId }) => chrome.tabs.create({ url, windowId, active: false }), { url: OTHER_URL, windowId });
  const otherPage = await opened;
  await otherPage.waitForLoadState();
  await otherPage.evaluate(() => (document.body.style.background = 'rgb(0, 0, 220)'));
  await new Promise((r) => setTimeout(r, 11_000)); // past the warning cool-down
  await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), tab.id!);

  await waitForEvents(attemptId, (r) => count(r, 'exam_tab_hidden') === 1);
  await expect.poll(async () => (await eventShot(attemptId, 'exam_tab_hidden')).shot?.id, { timeout: 15_000 }).toBeTruthy();
  const { shot } = await eventShot(attemptId, 'exam_tab_hidden');
  const { data: file } = await serviceClient().storage.from('screenshots').download(shot!.storage_path);
  const b64 = Buffer.from(await file!.arrayBuffer()).toString('base64');
  const [r, , b] = await otherPage.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(Math.floor(img.width / 2), img.height - 10, 1, 1).data);
  }, b64);
  expect(b, 'blue (the other site)').toBeGreaterThan(150);
  expect(r, 'not red (the exam)').toBeLessThan(80);
});

test('T64: a missed fullscreen change is caught by the heartbeat; leaving fullscreen is still a warning', async ({ context, ext, worker }) => {
  test.setTimeout(90_000);
  const { attemptId } = await startExam(context, ext, { warningLimit: 10 });
  await waitForEvents(attemptId, (r) => count(r, 'fullscreen_enter') === 1, 15_000);
  // Simulate Chrome reporting the change too early: ICU believes the window is not fullscreen.
  await setStored(worker, { window_state: 'normal' });
  // The heartbeat (every 15 s) re-checks and records the real state.
  await waitForEvents(attemptId, (r) => count(r, 'fullscreen_enter') === 2, 30_000);
  await new Promise((r) => setTimeout(r, 11_000)); // past the warning cool-down
  const { exam_window_id: windowId } = await stored(ext);
  await worker.evaluate((id) => chrome.windows.update(id, { state: 'normal' }), windowId);
  const rows = await waitForEvents(attemptId, (r) => count(r, 'fullscreen_exit') === 1);
  expect(rows.some((r) => r.type === 'warning_shown' && r.details.reason_type === 'fullscreen_exit')).toBe(true);
});

test('T65: if the fullscreen request is ignored, ICU asks again until the exam window is fullscreen', async ({ context, ext, worker }) => {
  test.setTimeout(90_000);
  const { attemptId } = await startExam(context, ext, { warningLimit: 10 });
  await waitForEvents(attemptId, (r) => count(r, 'fullscreen_enter') === 1, 15_000);
  // Simulate macOS ignoring the request: never seen in fullscreen, and the window is normal.
  await setStored(worker, { fullscreen_seen: false, fullscreen_tries: 1, window_state: 'normal' });
  const { exam_window_id: windowId } = await stored(ext);
  await worker.evaluate((id) => chrome.windows.update(id, { state: 'normal' }), windowId);
  await expect.poll(async () => worker.evaluate(async (id) => (await chrome.windows.get(id)).state, windowId), { timeout: 30_000 }).toBe('fullscreen');
  const rows = await waitForEvents(attemptId, (r) => count(r, 'fullscreen_enter') === 2);
  expect(count(rows, 'fullscreen_exit')).toBe(0);
});
