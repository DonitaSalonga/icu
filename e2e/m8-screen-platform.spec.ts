// 2026-11-15: whole-screen sharing (D9, Q36/Q37) and exam platforms typed by the admin (rules 1–3).
import { resetData, serviceClient } from '../supabase/scripts/testEnv';
import { count, createSession, EXAM_URL, events, expect, OTHER_URL, scrollNoticeToEnd, shareScreenAndStart, startExam, test, waitForEvents } from './fixtures';
import { TEST_PASSWORD, TEST_USERS } from '../supabase/scripts/testEnv';

test.beforeEach(async () => {
  await resetData();
});

test('Q37: the exam cannot start without sharing the entire screen', async ({ context, ext }) => {
  await createSession().then(async (s) => {
    await ext.send({ type: 'auth.signIn', email: TEST_USERS.student1.email, password: TEST_PASSWORD });
    await ext.send({ type: 'attempt.join', code: s.code });
  });
  // Starting without a share is refused by the extension itself.
  await expect(ext.send({ type: 'attempt.start', age_confirmed: true, consent_version: 'x' })).rejects.toThrow(/ICU_SCREEN_SHARE_REQUIRED/);
  const status = await ext.send<{ state: string }>({ type: 'attempt.status' });
  expect(status.state).toBe('joined');
  void context;
});

test('Q36: screenshots are of the entire screen; closing the monitoring tab records it; sharing again resumes', async ({ context, ext }) => {
  const { exam, attemptId, monitor } = await startExam(context, ext, { warningLimit: 10 });
  expect(await monitor.title()).toContain('ICU monitoring');
  await exam.waitForTimeout(1500);
  await exam.evaluate(() => document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true })));
  // The violation screenshot comes from the whole-screen share and still records the exam site in front.
  await expect.poll(async () => (await serviceClient().from('screenshots').select('reason, visible_path').eq('attempt_id', attemptId)).data?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);

  await exam.waitForTimeout(11_000); // past the 10 s warning cool-down started by the paste
  await monitor.close();
  const rows = await waitForEvents(attemptId, (r) => count(r, 'screen_share_stopped') === 1);
  expect(count(rows, 'screen_share_stopped')).toBe(1);
  expect(rows.some((r) => r.type === 'warning_shown' && r.details.reason_type === 'screen_share_stopped')).toBe(true);
  let status = await ext.send<{ screen_sharing: boolean }>({ type: 'attempt.status' });
  expect(status.screen_sharing).toBe(false);

  const reshare = await context.newPage();
  await reshare.goto(`chrome-extension://${ext.extensionId}/notice.html?reshare=1`);
  await reshare.getByRole('button', { name: 'Share entire screen' }).click();
  await reshare.getByRole('heading', { name: 'ICU monitoring' }).waitFor();
  await waitForEvents(attemptId, (r) => count(r, 'screen_share_started') === 1);
  status = await ext.send<{ screen_sharing: boolean }>({ type: 'attempt.status' });
  expect(status.screen_sharing).toBe(true);
});

test('rules 1–3: a platform keyword; other tabs on the platform are visits; exam-tab page changes are logged', async ({ context, ext, worker }) => {
  // "localhost" as a platform keyword: every fixture page is on the exam platform.
  const session = await createSession({ patterns: ['localhost'] });
  const exam = await context.newPage();
  await exam.goto(EXAM_URL);
  await ext.send({ type: 'auth.signIn', email: TEST_USERS.student1.email, password: TEST_PASSWORD });
  const { attempt_id: attemptId } = await ext.send<{ attempt_id: string }>({ type: 'attempt.join', code: session.code });
  await shareScreenAndStart(context, ext);
  await exam.bringToFront();
  await exam.waitForTimeout(1500);

  // Rule 3: another page of the platform in the exam tab → exam_page_changed (no warning).
  await exam.goto('http://localhost:4173/exam/frame.html');
  await waitForEvents(attemptId, (r) => count(r, 'exam_page_changed') === 1);
  // Rule 2: a second tab on the same platform (course notes) → url_visited, and leaving the exam tab warns.
  const ids = await worker.evaluate(async () => (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as { exam_window_id: number });
  await worker.evaluate(({ url, windowId }) => chrome.tabs.create({ url, windowId, active: true }), { url: OTHER_URL, windowId: ids.exam_window_id });
  const rows = await waitForEvents(attemptId, (r) => count(r, 'url_visited') === 1 && count(r, 'exam_tab_hidden') === 1);
  expect(rows.find((r) => r.type === 'exam_page_changed')!.details).toEqual({ host: 'localhost:4173', path: '/exam/frame.html' });
  expect(rows.find((r) => r.type === 'url_visited')!.details).toEqual({ host: 'localhost:4173', path: '/other/page.html' });
  expect(count(rows, 'navigated_off_exam')).toBe(0);
  expect(rows.filter((r) => r.type === 'warning_shown').map((r) => r.details.reason_type)).toEqual(['exam_tab_hidden']);
  void events;
});

// 2026-11-15 feedback: fullscreen went on over the "ICU monitoring" tab, and leaving it to reach the exam counted as a warning.
const attemptState = (ext: { inWorker: <T>(fn: () => T | Promise<T>) => Promise<T> }) =>
  ext.inWorker(async () => {
    const a = (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as { exam_tab_id?: number; monitor_tab_id?: number; fullscreen_requested?: boolean };
    const exam = a.exam_tab_id === undefined ? undefined : await chrome.tabs.get(a.exam_tab_id);
    return { ...a, examActive: exam?.active ?? false, examUrl: exam?.url };
  });

test('T60: Start brings the exam tab to the front; the ICU tab and "Go to my exam" are not leaving', async ({ context, ext }) => {
  const session = await createSession();
  const exam = await context.newPage();
  await exam.goto(EXAM_URL);
  await ext.send({ type: 'auth.signIn', email: TEST_USERS.student1.email, password: TEST_PASSWORD });
  const { attempt_id: attemptId } = await ext.send<{ attempt_id: string }>({ type: 'attempt.join', code: session.code });
  // The real popup path: Continue opens the notice from the exam page.
  const noticeOpened = context.waitForEvent('page', (p) => p.url().endsWith('/notice.html'));
  await ext.send({ type: 'attempt.openNotice' });
  const monitor = await noticeOpened;
  await monitor.getByLabel('I am 18 or older').check();
  await monitor.getByLabel(/I have read this notice/).check();
  await scrollNoticeToEnd(monitor);
  await monitor.getByRole('button', { name: 'I agree & share screen' }).click();
  await monitor.getByRole('heading', { name: 'ICU monitoring' }).waitFor({ timeout: 15_000 });

  await expect.poll(async () => (await attemptState(ext)).examActive).toBe(true);
  const state = await attemptState(ext);
  expect(state).toMatchObject({ examUrl: EXAM_URL, fullscreen_requested: true });
  // DSD v2: Continue opened the notice in its own small popup window, which now holds the screen share.
  const popoutType = await ext.inWorker(async () => {
    const a = (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as { monitor_window_id: number };
    return (await chrome.windows.get(a.monitor_window_id)).type;
  });
  expect(popoutType).toBe('popup'); // (its 480 px width isn't checkable here: Playwright resizes pages it controls)

  // Looking at the ICU monitoring tab, then "Go to my exam", doesn't count as leaving the exam.
  await ext.inWorker(async () => {
    const a = (await chrome.storage.local.get('icu-attempt'))['icu-attempt'] as { monitor_tab_id: number };
    await chrome.tabs.update(a.monitor_tab_id, { active: true });
  });
  await monitor.getByRole('button', { name: 'Go to my exam' }).click();
  await expect.poll(async () => (await attemptState(ext)).examActive).toBe(true);
  await exam.waitForTimeout(2000);
  await ext.send({ type: 'attempt.end' });
  const rows = await waitForEvents(attemptId, (r) => r.length > 0);
  for (const type of ['exam_tab_hidden', 'fullscreen_exit', 'warning_shown', 'url_visited']) expect(count(rows, type), type).toBe(0);
});

test('T61: with no exam page open, Start waits without fullscreen; opening the exam page binds it', async ({ context, ext }) => {
  const { attemptId, monitor } = await startExam(context, ext, { openExam: false });
  await expect(monitor.getByText('Now open your exam in this browser.')).toBeVisible();
  expect((await attemptState(ext)).fullscreen_requested).toBeFalsy();

  const exam = await context.newPage();
  await exam.goto(EXAM_URL);
  // Binding, bringing the tab to the front and requesting fullscreen happen in sequence: wait for all.
  await expect.poll(async () => { const s = await attemptState(ext); return [s.examUrl, s.examActive, s.fullscreen_requested]; }).toEqual([EXAM_URL, true, true]);
  await expect(monitor.getByRole('button', { name: 'Go to my exam' })).toBeVisible();
  await exam.waitForTimeout(2000);
  await ext.send({ type: 'attempt.end' });
  const rows = await waitForEvents(attemptId, (r) => r.length > 0);
  for (const type of ['exam_tab_hidden', 'fullscreen_exit', 'warning_shown']) expect(count(rows, type), type).toBe(0);
});
