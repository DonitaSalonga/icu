// T41 (R28): axe scans (WCAG 2.2 A/AA rules) of every screen, plus a keyboard-only pass.
// Pass: no serious or critical violations. Moderate/minor ones are printed for the record.
// The warning banner lives in a closed shadow root that axe can't enter; its contrast is checked
// with the token contrast table in docs/DSD.md (verified 2026-11-14).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { resetData, TEST_PASSWORD, TEST_USERS } from '../supabase/scripts/testEnv';
import { DASH, login, seed } from './dashboard-helpers';
import { createSession, EXAM_URL, expect, test } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page: Page, label: string) {
  const { violations, passes } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  console.log(`[axe] ${label}: ${passes.length} rules passed, ${violations.length} violated`);
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of violations) console.log(`[axe] ${label}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.help}`);
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), label).toEqual([]);
}

/** Presses Tab until an element with the given accessible text is focused (keyboard reachability). */
async function tabTo(page: Page, text: RegExp, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? `${el.getAttribute('aria-label') ?? ''} ${el.innerText ?? ''} ${(el as HTMLInputElement).labels?.[0]?.innerText ?? ''}` : '';
    });
    if (text.test(focused)) return;
  }
  throw new Error(`could not reach ${text} with Tab`);
}

test.beforeEach(async () => {
  await resetData();
});

test('T41: extension popup and notice screens have no serious axe violations', async ({ context, extensionId }) => {
  const session = await createSession();
  const exam = await context.newPage();
  await exam.goto(EXAM_URL);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: /I'm a student/ }).waitFor();
  await scan(popup, 'popup: role chooser');
  await popup.getByRole('button', { name: /I'm a student/ }).click();
  await scan(popup, 'popup: student sign in');
  await popup.getByLabel('Email').fill(TEST_USERS.student1.email);
  await popup.getByLabel('Password').fill(TEST_PASSWORD);
  await popup.getByRole('button', { name: 'Sign in' }).click();
  await popup.getByLabel('Session code').waitFor();
  await scan(popup, 'popup: join');
  await popup.getByLabel('Session code').fill(session.code);
  await popup.getByRole('button', { name: 'Join exam' }).click();
  await popup.getByRole('button', { name: 'Continue' }).waitFor();
  await scan(popup, 'popup: session summary');
  const [notice] = await Promise.all([context.waitForEvent('page'), popup.getByRole('button', { name: 'Continue' }).click()]);
  await notice.getByRole('heading', { name: /Privacy notice/ }).waitFor();
  await scan(notice, 'notice page');
  await notice.getByLabel('I am 18 or older').check();
  await notice.getByLabel(/I have read this notice/).check();
  await notice.getByRole('button', { name: 'Start exam monitoring' }).click();
  await notice.getByRole('heading', { name: 'Monitoring started' }).waitFor();
  await popup.reload();
  await popup.getByRole('button', { name: 'End exam' }).waitFor();
  await scan(popup, 'popup: monitoring');
});

test('T41: dashboard screens and dialogs have no serious axe violations', async ({ page }) => {
  const { session, attempts } = await seed();
  await page.goto(DASH);
  await page.getByRole('heading', { name: 'Sign up or sign in as' }).waitFor();
  await scan(page, 'dashboard: role chooser');
  await page.goto(`${DASH}/login`);
  await scan(page, 'dashboard: login');
  await login(page);
  await scan(page, 'dashboard: sessions');
  await page.getByRole('button', { name: 'Create session' }).first().click();
  await scan(page, 'dashboard: create-session dialog');
  await page.keyboard.press('Escape');
  await page.goto(`${DASH}/sessions/${session.id}`);
  await page.locator('tbody tr').first().waitFor();
  await scan(page, 'dashboard: session detail');
  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);
  await page.getByText('Risk breakdown').waitFor();
  await scan(page, 'dashboard: candidate review');
  await page.getByRole('button', { name: 'Screenshot' }).first().click();
  await scan(page, 'dashboard: screenshot lightbox');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Delete candidate data' }).click();
  await scan(page, 'dashboard: delete dialog');
});

test('T41: keyboard-only — chooser, login, create session, dialog Esc returns focus', async ({ page }) => {
  await page.goto(DASH);
  await tabTo(page, /I'm an admin/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  await tabTo(page, /Email/);
  await page.keyboard.type(TEST_USERS.adminA.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(TEST_PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Exam sessions' })).toBeVisible();

  await tabTo(page, /^\s*Create session/);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await page.keyboard.type('Keyboard session');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Create session' }).first()).toBeFocused();
});
