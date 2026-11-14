// M2 signal tests (QAD.md T28–T32, T35). Headless Chromium with the extension against icu-test.
import type { Worker } from '@playwright/test';
import { resetData } from '../supabase/scripts/testEnv';
import { count, EXAM_URL, expect, OTHER_URL, startExam, test, waitForEvents } from './fixtures';

const examIds = (worker: Worker) =>
  worker.evaluate(async () => {
    const a = (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as { exam_tab_id?: number; exam_window_id?: number };
    return { tabId: a.exam_tab_id, windowId: a.exam_window_id };
  });

test.beforeEach(async () => {
  await resetData();
});

test('T28 (tabs) + T29: tab switch, new tab, visited URL, navigate off exam; warning banner and notification', async ({ context, ext, worker }) => {
  const { exam, attemptId } = await startExam(context, ext);
  await expect.poll(async () => (await examIds(worker)).tabId, { timeout: 10_000 }).toBeDefined();
  const { tabId, windowId } = await examIds(worker);

  // Leave the exam tab for ~5 s by opening another site in a new tab of the exam window.
  await worker.evaluate(({ url, windowId }) => chrome.tabs.create({ url, windowId, active: true }), { url: `${OTHER_URL}?secret=1#frag`, windowId: windowId! });
  await new Promise((r) => setTimeout(r, 5000));
  await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), tabId!);

  const rows = await waitForEvents(attemptId, (r) => count(r, 'exam_tab_visible') === 1 && count(r, 'url_visited') >= 1);
  expect(count(rows, 'exam_tab_hidden')).toBe(1);
  expect(count(rows, 'tab_opened')).toBeGreaterThanOrEqual(1);
  const away = Number(rows.find((r) => r.type === 'exam_tab_visible')!.details.away_ms);
  expect(away).toBeGreaterThan(4000);
  expect(away).toBeLessThan(7000);
  const visited = rows.find((r) => r.type === 'url_visited')!;
  expect(visited.details).toEqual({ host: 'localhost:4173', path: '/other/page.html' });
  expect(JSON.stringify(rows)).not.toMatch(/secret|frag/);
  expect(count(rows, 'warning_shown')).toBe(1);

  // Banner host element exists on the exam page; a notification was created.
  await expect(exam.locator('icu-warning-banner')).toHaveCount(1);
  const notifications = await worker.evaluate(() => chrome.notifications.getAll());
  expect(Object.keys(notifications).some((k) => k.startsWith('icu-warning-'))).toBe(true);

  // T29: navigate the exam tab itself to another site.
  await exam.goto(`${OTHER_URL}?q=answers#x`);
  const after = await waitForEvents(attemptId, (r) => count(r, 'navigated_off_exam') === 1);
  expect(after.find((r) => r.type === 'navigated_off_exam')!.details).toEqual({ host: 'localhost:4173', path: '/other/page.html' });
});

test('T30: clipboard and context menu on the exam page (top frame and iframe), not elsewhere, no content', async ({ context, ext }) => {
  const { exam, attemptId } = await startExam(context, ext, { warningLimit: 10 });
  await exam.waitForTimeout(1500); // content scripts activated

  const fire = `for (const t of ['copy','cut','paste']) document.dispatchEvent(new ClipboardEvent(t, { bubbles: true }));
                document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));`;
  await exam.evaluate(fire);
  await exam.frameLocator('#frame').locator('body').evaluate((_, code) => eval(code), fire);

  const other = await context.newPage();
  await other.goto(OTHER_URL);
  await other.evaluate(fire);

  const rows = await waitForEvents(attemptId, (r) => count(r, 'context_menu') === 2 && count(r, 'paste') === 2);
  for (const type of ['copy', 'cut', 'paste', 'context_menu']) {
    expect(rows.filter((r) => r.type === type).map((r) => r.details.frame).sort()).toEqual(['sub', 'top']);
  }
  expect(JSON.stringify(rows)).not.toContain('The answer is 42');
});

test('T31: fullscreen is requested at Start; leaving it is recorded with a warning', async ({ context, ext, worker }) => {
  const { attemptId } = await startExam(context, ext);
  const rows = await waitForEvents(attemptId, (r) => count(r, 'fullscreen_enter') === 1, 15_000);
  expect(count(rows, 'fullscreen_enter')).toBe(1);
  const { windowId } = await examIds(worker);
  await worker.evaluate((id) => chrome.windows.update(id, { state: 'normal' }), windowId!);
  const after = await waitForEvents(attemptId, (r) => count(r, 'fullscreen_exit') === 1);
  expect(count(after, 'fullscreen_exit')).toBe(1);
  expect(count(after, 'warning_shown')).toBe(1);
});

test('T32: exam page not detected (test timing: 30 s alarm)', async ({ context, ext }) => {
  const { attemptId } = await startExam(context, ext, { openExam: false });
  const rows = await waitForEvents(attemptId, (r) => count(r, 'exam_page_not_detected') === 1, 60_000);
  expect(count(rows, 'exam_page_not_detected')).toBe(1);
  // Opening the exam page later binds it.
  const exam = await context.newPage();
  await exam.goto(EXAM_URL);
});

test('T35: warning cool-down and limit; monitoring continues after the limit', async ({ context, ext }) => {
  const { exam, attemptId } = await startExam(context, ext, { warningLimit: 3 });
  await exam.waitForTimeout(1500);
  const paste = () => exam.evaluate(() => document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true })));
  await paste();
  await paste(); // within the 10 s cool-down: recorded, no new warning
  for (let i = 0; i < 3; i++) {
    await exam.waitForTimeout(11_000);
    await paste();
  }
  const rows = await waitForEvents(attemptId, (r) => count(r, 'paste') === 5 && count(r, 'warning_shown') === 4);
  expect(count(rows, 'warning_shown')).toBe(4);
  expect(count(rows, 'warning_limit_reached')).toBe(1);
  expect(rows.filter((r) => r.type === 'warning_shown').map((r) => r.details.n)).toEqual([1, 2, 3, 4]);
});
