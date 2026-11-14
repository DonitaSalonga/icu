// M4 dashboard tests (QAD.md T39, T40) against icu-test. Data is seeded through the API as a student.
import { test as base, expect } from '@playwright/test';
import { serviceClient } from '../supabase/scripts/testEnv';
import { DASH, login, seed } from './dashboard-helpers';

const test = base;

test('T39: create a session; triage by risk; review timeline, filters, breakdown, screenshots', async ({ page }) => {
  const { session } = await seed();
  await login(page);

  // Create a session through the dialog.
  await page.getByRole('button', { name: 'Create session' }).first().click();
  await page.getByLabel('Name').fill('Created in E2E');
  await page.getByRole('dialog').getByRole('button', { name: 'Create session' }).click();
  const status = page.getByRole('status').filter({ hasText: 'Created in E2E' });
  await expect(status).toBeVisible();
  const code = (await status.locator('.font-mono').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await expect(page.getByRole('row', { name: /Created in E2E/ })).toContainText(code);

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
  await expect(page.locator('main header')).toContainText('High· 15');
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

test('T40: verdict save and change; delete data with typed confirmation', async ({ page }) => {
  const { session, attempts } = await seed();
  await login(page);
  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);

  await page.getByLabel('Suspicious').check();
  await page.getByLabel('Note (optional)').fill('Visited ChatGPT during the exam');
  const saved = () => page.waitForResponse((r) => r.url().includes('/rpc/set_verdict') && r.ok());
  await Promise.all([saved(), page.getByRole('button', { name: 'Save verdict' }).click()]);
  await expect(page.getByRole('status').filter({ hasText: 'Verdict saved.' })).toBeVisible();
  await page.getByLabel('Cheating confirmed').check();
  await Promise.all([saved(), page.getByRole('button', { name: 'Save verdict' }).click()]);
  await page.goto(`${DASH}/sessions/${session.id}`);
  await expect(page.locator('tbody tr').first()).toContainText('Cheating confirmed');

  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);
  await page.getByRole('button', { name: 'Delete candidate data' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await confirm.getByLabel('Type DELETE to confirm').fill('DELETE');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/Data deleted on/)).toBeVisible();
  await expect(page.getByText('No screenshots.')).toBeVisible();
  const { data: left } = await serviceClient().storage.from('screenshots').list(`${session.id}/${attempts.student1}`);
  expect(left).toEqual([]);
});
