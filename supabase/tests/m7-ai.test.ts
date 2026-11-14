// R32 AI suggestion against ocm-test with the real analysis model (QAD.md T54). Uses 2 model requests.
// Automatic analysis is off in the test project (app_settings.ai_auto); this test turns it on briefly.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientAs, resetData, seedUsers, serviceClient, TEST_URL, testEnvConfigured } from '../scripts/testEnv';

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

async function waitForAnalysis(attemptId: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { data } = await serviceClient().from('ai_analyses').select('*').eq('attempt_id', attemptId).maybeSingle();
    if (data && data.status !== 'pending') return data;
    if (Date.now() > deadline) return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

describe.skipIf(!testEnvConfigured)('AI suggestion (ocm-test, real model)', () => {
  let adminA: SupabaseClient;
  let adminB: SupabaseClient;
  let student: SupabaseClient;
  const db = () => serviceClient();

  beforeAll(async () => {
    await seedUsers();
    await resetData();
    [adminA, adminB, student] = await Promise.all([clientAs('adminA'), clientAs('adminB'), clientAs('student1')]);
  });
  afterAll(async () => {
    await db().from('app_settings').update({ ai_auto: false }).eq('id', true);
  });

  it('T54: ending an attempt triggers one analysis; re-analyze is admin-only; deletion removes it', async () => {
    const session = (await adminA.rpc('create_session', { p_name: 'AI', p_url_patterns: ['https://docs.google.com/forms/*'], p_starts_at: minutes(-30), p_ends_at: minutes(60) })).data as { id: string; code: string };
    const attemptId = (await student.rpc('join_session', { p_code: session.code })).data.attempt_id as string;
    expect((await student.rpc('start_attempt', { p_attempt_id: attemptId, p_consent_version: 't', p_age_confirmed: true })).error).toBeNull();
    const started = Date.now() - 20 * 60_000;
    await db().from('attempts').update({ started_at: new Date(started).toISOString() }).eq('id', attemptId);
    const at = (s: number) => new Date(started + s * 1000).toISOString();

    const shot = randomUUID();
    await db().from('screenshots').insert({ id: shot, attempt_id: attemptId, storage_path: `${session.id}/${attemptId}/${shot}.jpg`, captured_at: at(192), reason: 'violation', bytes: 1000, visible_host: 'chatgpt.com', visible_path: '/c/1' });
    await db().from('events').insert([
      { id: randomUUID(), attempt_id: attemptId, type: 'fullscreen_enter', occurred_at: at(1), details: {} },
      { id: randomUUID(), attempt_id: attemptId, type: 'exam_tab_hidden', occurred_at: at(192), details: {}, screenshot_id: shot },
      { id: randomUUID(), attempt_id: attemptId, type: 'url_visited', occurred_at: at(193), details: { host: 'chatgpt.com', path: '/c/1' } },
      { id: randomUUID(), attempt_id: attemptId, type: 'exam_tab_visible', occurred_at: at(240), details: { away_ms: 48000 } },
      { id: randomUUID(), attempt_id: attemptId, type: 'paste', occurred_at: at(245), details: { frame: 'top' }, screenshot_id: shot },
    ]);

    // Automatic path: the attempts trigger calls ai-analyze when the attempt ends.
    await db().from('app_settings').update({ ai_auto: true }).eq('id', true);
    expect((await student.rpc('end_attempt', { p_attempt_id: attemptId, p_reason: 'student' })).error).toBeNull();
    const first = await waitForAnalysis(attemptId);
    await db().from('app_settings').update({ ai_auto: false }).eq('id', true);
    expect(first?.status, first?.error ?? '').toBe('done');
    expect(first!.suggestion).toMatch(/^cheating_/);
    const total = Object.values(first!.probabilities as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThan(1.02);
    expect(first!.model).toMatch(/^jev/);

    // Visibility: the session admin only.
    expect((await adminA.from('ai_analyses').select('suggestion').eq('attempt_id', attemptId)).data).toHaveLength(1);
    expect((await adminB.from('ai_analyses').select('suggestion').eq('attempt_id', attemptId)).data).toEqual([]);
    expect((await student.from('ai_analyses').select('suggestion')).data).toEqual([]);

    // Re-analyze: admin-only, throttled to one pending request per 30 s.
    expect((await adminB.rpc('request_ai_analysis', { p_attempt_id: attemptId })).error?.message).toMatch(/ICU_NOT_SESSION_ADMIN/);
    expect((await student.rpc('request_ai_analysis', { p_attempt_id: attemptId })).error?.message).toMatch(/ICU_NOT_SESSION_ADMIN/);
    expect((await adminA.rpc('request_ai_analysis', { p_attempt_id: attemptId })).data).toEqual({ status: 'pending' });
    const again = await adminA.rpc('request_ai_analysis', { p_attempt_id: attemptId });
    expect(again.data).toEqual({ status: 'pending' });
    const second = await waitForAnalysis(attemptId);
    expect(second?.status, second?.error ?? '').toBe('done');
    expect(Date.parse(second!.analyzed_at)).toBeGreaterThan(Date.parse(first!.analyzed_at));

    // Early deletion removes the suggestion with the data (R23).
    expect((await adminA.rpc('delete_attempt_rows', { p_attempt_id: attemptId })).error).toBeNull();
    expect((await db().from('ai_analyses').select('attempt_id').eq('attempt_id', attemptId)).data).toEqual([]);
    expect((await adminA.rpc('request_ai_analysis', { p_attempt_id: attemptId })).error?.message).toMatch(/ICU_NOTHING_TO_ANALYZE/);
  });

  it('the function rejects calls without the shared secret', async () => {
    const res = await fetch(`${TEST_URL}/functions/v1/ai-analyze`, { method: 'POST', body: '{"sweep":true}' });
    expect(res.status).toBe(401);
  });
});
