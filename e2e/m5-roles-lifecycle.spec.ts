// M5 tests (QAD.md T25, T26, T27, T36, T37) plus uninstall-URL wiring (R15).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetData, serviceClient, TEST_PASSWORD, TEST_URL, TEST_USERS } from '../supabase/scripts/testEnv';
import { createSession, EXAM_URL, expect, heartbeats, launch, startExam, test } from './fixtures';

const DASH = 'http://localhost:5174';

test.beforeEach(async () => {
  await resetData();
});

test('T25: role chooser in the extension and the dashboard', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole('button', { name: /I'm a student/ })).toBeVisible();
  const [dashboardTab] = await Promise.all([context.waitForEvent('page'), popup.getByRole('button', { name: /I'm an admin/ }).click()]);
  await dashboardTab.waitForLoadState();
  expect(dashboardTab.url()).toContain('localhost:5174');
  await popup.getByRole('button', { name: /I'm a student/ }).click();
  await expect(popup.getByRole('heading', { name: 'Student sign in' })).toBeVisible();

  const dash = await context.newPage();
  await dash.goto(DASH);
  await dash.getByRole('button', { name: /I'm a student/ }).click();
  await expect(dash.getByRole('heading', { name: 'Install the extension to take exams' })).toBeVisible();
  await expect(dash.getByLabel('Email')).toHaveCount(0);
  await dash.getByRole('button', { name: 'Back' }).click();
  await dash.getByRole('link', { name: /I'm an admin/ }).click();
  await expect(dash.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
});

test('T26: wrong-role accounts are turned away in each app', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: /I'm a student/ }).click();
  await popup.getByLabel('Email').fill(TEST_USERS.adminA.email);
  await popup.getByLabel('Password').fill(TEST_PASSWORD);
  await popup.getByRole('button', { name: 'Sign in' }).click();
  await expect(popup.getByText('This is an admin account. Use the dashboard.')).toBeVisible();
  await expect(popup.getByLabel('Session code')).toHaveCount(0);

  const dash = await context.newPage();
  await dash.goto(`${DASH}/login`);
  await dash.getByLabel('Email').fill(TEST_USERS.student1.email);
  await dash.getByLabel('Password').fill(TEST_PASSWORD);
  await dash.getByRole('button', { name: 'Sign in' }).click();
  await expect(dash.getByText('This is a student account. Use the Chrome extension.')).toBeVisible();
  await expect(dash.getByRole('heading', { name: 'Exam sessions' })).toHaveCount(0);
});

test('T27 + R15: student flow through the popup and notice; uninstall token works, cleared at End', async ({ context, extensionId }) => {
  const session = await createSession();
  const exam = await context.newPage();
  await exam.goto(EXAM_URL);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: /I'm a student/ }).click();
  await popup.getByLabel('Email').fill(TEST_USERS.student1.email);
  await popup.getByLabel('Password').fill(TEST_PASSWORD);
  await popup.getByRole('button', { name: 'Sign in' }).click();
  await popup.getByLabel('Session code').fill(session.code.toLowerCase());
  await popup.getByRole('button', { name: 'Join exam' }).click();
  await expect(popup.getByText(/Examiner: Admin A/)).toBeVisible();

  const [notice] = await Promise.all([context.waitForEvent('page'), popup.getByRole('button', { name: 'Continue' }).click()]);
  await expect(notice.getByRole('heading', { name: 'ICU privacy notice: exam monitoring' })).toBeVisible();
  await expect(notice.getByText(/Data Privacy Act of 2012/)).toBeVisible();
  await expect(notice.getByText(/admin-a@test.local/).first()).toBeVisible();
  const start = notice.getByRole('button', { name: 'Start exam monitoring' });
  await expect(start).toBeDisabled();
  await notice.getByLabel('I am 18 or older').check();
  await expect(start).toBeDisabled();
  await notice.getByLabel(/I have read this notice/).check();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(notice.getByRole('heading', { name: 'Monitoring started' })).toBeVisible();

  const { data: attempt } = await serviceClient().from('attempts').select('id, status, consent_version, age_confirmed, uninstall_token').eq('status', 'active').single();
  expect(attempt).toMatchObject({ status: 'active', consent_version: '2026-11-14.1', age_confirmed: true });
  await popup.reload();
  await expect(popup.getByText('Monitoring', { exact: true })).toBeVisible();

  // R15: the token behind the uninstall URL is opaque, and the beacon records the removal once.
  expect(attempt!.uninstall_token).toMatch(/^[0-9a-f-]{36}$/);
  const beacon = await fetch(`${TEST_URL}/functions/v1/uninstall-beacon?t=${attempt!.uninstall_token}`);
  expect(beacon.status).toBe(200);
  const { data: ev } = await serviceClient().from('events').select('type').eq('attempt_id', attempt!.id).eq('type', 'extension_uninstalled');
  expect(ev).toHaveLength(1);

  popup.once('dialog', (d) => void d.accept());
  await popup.getByRole('button', { name: 'End exam' }).click();
  await expect(popup.getByText('Exam ended.')).toBeVisible();
  const { data: ended } = await serviceClient().from('attempts').select('status, end_reason, uninstall_token').eq('id', attempt!.id).single();
  expect(ended).toMatchObject({ status: 'ended', end_reason: 'student', uninstall_token: null });
  expect(exam.isClosed()).toBe(false);
});

test('T36: the attempt ends automatically at the session end time', async ({ context, ext }) => {
  test.setTimeout(180_000);
  const { exam, attemptId } = await startExam(context, ext, { endsInMin: 1 });
  await exam.waitForTimeout(80_000);
  const { data: attempt } = await serviceClient().from('attempts').select('status, end_reason, ended_at').eq('id', attemptId).single();
  expect(attempt).toMatchObject({ status: 'ended', end_reason: 'time_window' });
  const status = await ext.send<{ state: string }>({ type: 'attempt.status' });
  expect(status.state).toBe('ended');
  const late = (await heartbeats(attemptId)).filter((h) => Date.parse(h.received_at) > Date.parse(attempt!.ended_at!));
  expect(late).toEqual([]);
});

test('T37: monitoring resumes after the browser restarts; the downtime is a gap', async () => {
  test.setTimeout(240_000);
  const userDataDir = mkdtempSync(join(tmpdir(), 'icu-restart-'));
  let context = await launch(userDataDir);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const { ExtensionDriver } = await import('./fixtures');
  const ext = new ExtensionDriver(context, new URL(worker.url()).host);
  const { attemptId } = await startExam(context, ext);
  await new Promise((r) => setTimeout(r, 20_000));
  await context.close();
  const closedAt = Date.now();
  await new Promise((r) => setTimeout(r, 70_000));

  context = await launch(userDataDir);
  const reopenedAt = Date.now();
  const exam = await context.newPage();
  await exam.goto(EXAM_URL);
  await exam.waitForTimeout(35_000);
  const beats = (await heartbeats(attemptId)).map((h) => Date.parse(h.received_at));
  expect(beats.some((t) => t > reopenedAt)).toBe(true);
  const hole = beats.filter((t) => t < closedAt).at(-1)!;
  const next = beats.find((t) => t > closedAt)!;
  expect(next - hole).toBeGreaterThan(60_000);
  await context.close();
});

