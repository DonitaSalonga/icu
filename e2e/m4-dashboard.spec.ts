// M4 dashboard tests (QAD.md T39, T40) against icu-test. Data is seeded through the API as a student.
import { test as base, expect } from '@playwright/test';
import { serviceClient } from '../supabase/scripts/testEnv';
import { DASH, login, seed } from './dashboard-helpers';

const test = base;

test('T39: create a session; triage by risk; review timeline, filters, breakdown, screenshots', async ({ page }) => {
  const { session } = await seed();
  await login(page);

  // The sidebar leads from Overview to Sessions.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sessions' }).click();
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();

  // Create a session through the dialog.
  await page.getByRole('button', { name: 'Create session' }).first().click();
  await page.getByLabel('Name').fill('Created in E2E');
  await page.getByLabel('Exam platform', { exact: true }).fill('docs.google.com/forms');
  await page.getByLabel('Exam platform', { exact: true }).press('Enter');
  await expect(page.getByRole('list', { name: 'Exam platforms' })).toContainText('docs.google.com/forms');
  await page.getByLabel(/Tell us about the exam/).fill('CCNA 1 final exam, 60 questions');
  await page.getByRole('dialog').getByRole('button', { name: 'Create session' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Session created.' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Created in E2E/ })).toContainText('docs.google.com/forms');

  // Clicking a session shows what the exam is (2026-11-15 feedback), and its code.
  await page.getByRole('link', { name: 'Created in E2E' }).click();
  const code = (await page.locator('.head .sub .mono').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  const info = page.getByRole('region', { name: 'Exam info' });
  await expect(info).toContainText('CCNA 1 final exam, 60 questions');
  await expect(info).toContainText('docs.google.com/forms pages');
  await expect(info).toContainText(code);
  // The breadcrumb leads back to Sessions.
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Sessions' }).click();

  // Session detail: High candidate first.
  await page.getByRole('link', { name: 'Seeded quiz' }).click();
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Student One');
  await expect(rows.nth(0)).toContainText('High');
  await expect(rows.nth(1)).toContainText('Student Two');
  await expect(rows.nth(1)).toContainText('Low');

  // Candidate review.
  await page.getByRole('link', { name: 'Student One' }).click();
  await expect(page.getByRole('heading', { name: 'Student One' })).toBeVisible();
  const items = page.locator('ol > li');
  await expect(page.locator('ol > li', { hasText: 'Monitoring lost' })).toHaveCount(1);
  await expect(page.locator('ol > li', { hasText: 'Monitoring lost' })).toContainText('3 min 0 s');
  const times = await items.locator('time').allTextContents();
  expect([...times].sort()).toEqual(times);
  await expect(page.getByText('Visited chatgpt.com/c/1')).toBeVisible();

  // Breakdown total equals the badge score: 2+2 (left tab) + 3 (paste) + 8 (gap) = 15; the limit forces High.
  const total = page.locator('section', { hasText: 'Risk breakdown' }).getByRole('row', { name: /Total/ });
  await expect(total).toContainText('15');
  await expect(page.locator('.head')).toContainText('High · 15');
  await expect(page.getByText(/warning limit was reached/)).toBeVisible();

  // Filters: hide "Left exam tab" without reloading.
  await page.getByRole('button', { name: /Left exam tab · 2/ }).click();
  await expect(page.locator('ol > li', { hasText: /^.*Left exam tab$/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Left exam tab · 2/ }).click();

  // Screenshot from an event shows its linked events.
  await page.locator('ol > li', { hasText: 'Pasted on exam page' }).getByRole('button', { name: 'Screenshot' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img')).toBeVisible();
  await expect(dialog).toContainText('Left exam tab');
  await expect(dialog).toContainText('Pasted on exam page');
  expect(session.id).toBeTruthy();
});

test('T40: verdict save and change; delete data with press-and-hold', async ({ page }) => {
  const { session, attempts } = await seed();
  await login(page);
  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);

  await page.getByLabel('Suspicious').check();
  const saved = () => page.waitForResponse((r) => r.url().includes('/rpc/set_verdict') && r.ok());
  await Promise.all([saved(), page.getByRole('button', { name: 'Save verdict' }).click()]);
  await expect(page.getByRole('status').filter({ hasText: 'Verdict saved.' })).toBeVisible();
  await page.getByLabel('Cheating confirmed').check();
  await Promise.all([saved(), page.getByRole('button', { name: 'Save verdict' }).click()]);
  const { data: verdictRow } = await serviceClient().from('attempts').select('verdict').eq('id', attempts.student1!).single();
  expect(verdictRow?.verdict).toBe('cheating_confirmed');
  // With a verdict, the candidate no longer needs review.
  await page.goto(`${DASH}/review`);
  await expect(page.getByRole('link', { name: 'Student Two' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Student One' })).toHaveCount(0);

  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);
  const hold = page.getByRole('button', { name: /Hold to delete candidate data/ });
  // Press and hold with the keyboard (the design supports Enter/Space as well as the pointer).
  // A short press does nothing.
  await hold.focus();
  await page.keyboard.down('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.up('Enter');
  await expect(hold).toBeVisible();
  // Holding for 1.4 s deletes.
  await page.keyboard.down('Enter');
  await page.waitForTimeout(1700);
  await page.keyboard.up('Enter');
  await expect(page.getByText('Candidate data deleted. This cannot be undone.')).toBeVisible();
  await expect(page.getByText(/Data deleted on/)).toBeVisible();
  await expect(page.getByText('No screenshots', { exact: true })).toBeVisible();
  const { data: left } = await serviceClient().storage.from('screenshots').list(`${session.id}/${attempts.student1}`);
  expect(left).toEqual([]);
});
