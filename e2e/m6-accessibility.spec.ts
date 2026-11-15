// T41 (R28): axe scans (WCAG 2.2 A/AA rules) of every screen, plus a keyboard-only pass.
// Pass: no serious or critical violations. Moderate/minor ones are printed for the record.
// The warning banner lives in a closed shadow root that axe can't enter; its contrast is checked
// with the token contrast table in docs/DSD.md (verified 2026-11-14).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { resetData, TEST_PASSWORD, TEST_USERS } from '../supabase/scripts/testEnv';
import { DASH, login, seed } from './dashboard-helpers';
import { createSession, EXAM_URL, expect, scrollNoticeToEnd, test } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page: Page, label: string) {
  // The design fades content in (".rise"); measure contrast once every animation has finished.
  // (Endless ones, like the code box's blinking caret, never finish and are ignored.)
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
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
  await popup.getByLabel('Exam code').waitFor();
  await scan(popup, 'popup: join');
  await popup.getByLabel('Exam code').fill(session.code);
  await popup.getByRole('button', { name: 'Find exam' }).click();
  await popup.getByRole('button', { name: 'Continue' }).waitFor();
  await scan(popup, 'popup: session summary');
  const [notice] = await Promise.all([context.waitForEvent('page'), popup.getByRole('button', { name: 'Continue' }).click()]);
  await notice.getByRole('heading', { name: /privacy & terms/i }).waitFor();
  await scan(notice, 'notice page');
  await notice.getByLabel('I am 18 or older').check();
  await notice.getByLabel(/I have read this notice/).check();
  await scrollNoticeToEnd(notice);
  await notice.getByRole('button', { name: 'I agree & share screen' }).click();
  await notice.getByRole('heading', { name: 'ICU monitoring' }).waitFor();
  await scan(notice, 'monitoring tab');
  await popup.reload();
  await popup.getByRole('button', { name: 'End exam' }).waitFor();
  await scan(popup, 'popup: monitoring');
});

test('T41: welcome page has no serious axe violations', async ({ context, extensionId }) => {
  const welcome = await context.newPage();
  await welcome.goto(`chrome-extension://${extensionId}/welcome.html`);
  await welcome.getByRole('heading', { name: 'Welcome to ICU' }).waitFor();
  await expect(welcome.getByRole('heading', { name: /Pin ICU/ })).toBeVisible();
  await scan(welcome, 'welcome page');
});

test('T41: dashboard screens and dialogs have no serious axe violations', async ({ page }) => {
  const { session, attempts } = await seed();
  await page.goto(DASH);
  await page.getByRole('heading', { name: 'Sign up or sign in as' }).waitFor();
  await scan(page, 'dashboard: role chooser');
  await page.goto(`${DASH}/login`);
  await scan(page, 'dashboard: login');
  await login(page);
  await scan(page, 'dashboard: overview');
  // Account menu (Base UI) from the sidebar user card.
  await page.getByRole('button', { name: /Admin A/ }).click();
  await page.getByRole('menuitem', { name: 'Account' }).waitFor();
  await scan(page, 'dashboard: account menu');
  await page.keyboard.press('Escape');
  await page.goto(`${DASH}/sessions`);
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  await page.getByRole('list', { name: 'Exam sessions' }).getByRole('listitem').first().waitFor();
  await scan(page, 'dashboard: sessions');
  await page.getByRole('button', { name: 'Create session' }).first().click();
  await scan(page, 'dashboard: create-session dialog');
  await page.keyboard.press('Escape');
  await page.goto(`${DASH}/review`);
  await page.getByRole('heading', { name: 'Needs review' }).first().waitFor();
  await page.getByRole('list', { name: 'Candidates to review' }).getByRole('listitem').first().waitFor();
  await scan(page, 'dashboard: needs review');
  await page.goto(`${DASH}/account`);
  await page.getByRole('heading', { name: 'Account settings', level: 1 }).waitFor();
  await scan(page, 'dashboard: account');
  await page.goto(`${DASH}/sessions/${session.id}`);
  await page.locator('tbody tr').first().waitFor();
  await scan(page, 'dashboard: session detail');
  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);
  await page.getByText('Risk breakdown').waitFor();
  await scan(page, 'dashboard: candidate review');
  await page.getByRole('button', { name: 'Screenshot' }).first().click();
  await scan(page, 'dashboard: screenshot lightbox');
  await page.keyboard.press('Escape');
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
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();

  // The sidebar is reachable by keyboard: Tab to Sessions, press Enter.
  await tabTo(page, /^\s*Sessions/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();

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
