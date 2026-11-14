// Automated proxy for T43 (storage budget) and T49 (no false flags), on a real public page.
// The full T43/T49 are manual runs on the demo Google Form (docs/QAD.md). This run uses the E2E
// build's 30 s screenshot interval, so the per-hour projection uses the production 60 s interval.
import { serviceClient, resetData } from '../supabase/scripts/testEnv';
import { admin, events, ExtensionDriver, expect, shareScreenAndStart, test } from './fixtures';

const PAGE = 'https://en.wikipedia.org/wiki/Philippines';

// Slow (5 min) and needs the public internet: run with ICU_E2E_SLOW=1 npm run test:e2e.
test.skip(!process.env.ICU_E2E_SLOW, 'set ICU_E2E_SLOW=1 to run');

test('T43/T49 proxy: real-page screenshot sizes and no warnings during normal reading', async ({ context, ext }) => {
  test.setTimeout(600_000);
  await resetData();
  const db = await admin();
  const { data: session } = await db.rpc('create_session', { p_name: 'Storage proxy', p_url_patterns: ['https://en.wikipedia.org/*'], p_starts_at: new Date(Date.now() - 60_000).toISOString(), p_ends_at: new Date(Date.now() + 3600_000).toISOString() });
  const exam = await context.newPage();
  await exam.setViewportSize({ width: 1366, height: 768 });
  await exam.goto(PAGE);
  const { TEST_USERS, TEST_PASSWORD } = await import('../supabase/scripts/testEnv');
  await (ext as ExtensionDriver).send({ type: 'auth.signIn', email: TEST_USERS.student1.email, password: TEST_PASSWORD });
  const joined = await ext.send<{ attempt_id: string }>({ type: 'attempt.join', code: (session as { code: string }).code });
  await shareScreenAndStart(context, ext);
  await exam.bringToFront();

  // Five minutes of "answering": scroll and read, no leaving, no pasting.
  for (let i = 0; i < 30; i++) {
    await exam.mouse.wheel(0, 400);
    await exam.waitForTimeout(10_000);
  }
  const { data: shots } = await serviceClient().from('screenshots').select('bytes').eq('attempt_id', joined.attempt_id);
  const sizes = shots!.map((s) => s.bytes).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
  const perHourMB = (median * 60) / 1_000_000;
  console.log(`[storage] ${sizes.length} screenshots, median ${median} B, max ${sizes.at(-1)} B → ~${perHourMB.toFixed(2)} MB per hour at 60 s`);
  expect(sizes.length).toBeGreaterThanOrEqual(8);
  expect(median).toBeLessThanOrEqual(150_000);
  expect(perHourMB).toBeLessThanOrEqual(10);

  const rows = await events(joined.attempt_id);
  const warnings = rows.filter((r) => r.type === 'warning_shown');
  console.log(`[false-flags] events: ${rows.map((r) => r.type).join(', ') || 'none'}`);
  expect(warnings).toEqual([]);
});
