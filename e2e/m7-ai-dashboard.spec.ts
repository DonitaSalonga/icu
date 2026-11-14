// R32 AI suggestion in the dashboard (QAD.md T55). Re-analyze makes one real model request on ocm-test.
import { test, expect } from '@playwright/test';
import { serviceClient } from '../supabase/scripts/testEnv';
import { DASH, login, seed } from './dashboard-helpers';

test('T55: AI suggestion shown in session detail and candidate review; Re-analyze runs a fresh analysis', async ({ page }) => {
  test.setTimeout(180_000);
  const { session, attempts } = await seed();
  const db = serviceClient();
  await db.from('ai_analyses').insert({
    attempt_id: attempts.student1,
    status: 'done',
    suggestion: 'cheating_ai_or_web',
    probabilities: { cheating_ai_or_web: 0.82, cheating_copy_paste: 0.14, cheating_monitoring_off: 0.03, needs_review: 0.01, likely_fine: 0 },
    confidence: 0.77,
    model: 'jev-seeded',
    analyzed_at: new Date(Date.now() - 3600_000).toISOString(),
  });

  await login(page);
  await page.goto(`${DASH}/sessions/${session.id}`);
  const first = page.locator('tbody tr').first();
  await expect(first).toContainText('Likely cheating: used AI or the web · 82%');
  await expect(page.locator('tbody tr').nth(1)).toContainText('—'); // student2 not analyzed

  await page.goto(`${DASH}/sessions/${session.id}/attempts/${attempts.student1}`);
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'AI suggestion' }) });
  await expect(card).toContainText('Likely cheating: used AI or the web');
  await expect(card).toContainText('82%');
  await expect(card).toContainText('confidence high');
  await expect(card.getByRole('list', { name: 'Probability of each option' }).getByRole('listitem')).toHaveCount(5);
  await expect(card).toContainText('your verdict is the decision');

  await card.getByRole('button', { name: 'Re-analyze' }).click();
  await expect(card).toContainText(/Analyzing/);
  await expect(card).toContainText(/Analyzed /, { timeout: 90_000 });
  const { data } = await db.from('ai_analyses').select('status, model, suggestion').eq('attempt_id', attempts.student1).single();
  expect(data!.status).toBe('done');
  expect(data!.model).toMatch(/^jev-\d/);
  console.log(`[T55] real re-analysis: ${data!.suggestion} (${data!.model})`);
});
