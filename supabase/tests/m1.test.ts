// M1 integration tests against the icu-test project (QAD.md T10, T11 backend part, T13–T17).
// Skipped until .env.test exists. Run: npm run test:integration
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientAs, resetData, seedUsers, serviceClient, testEnvConfigured } from '../scripts/testEnv';

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

async function createSession(admin: SupabaseClient, startOffsetMin = -1, endOffsetMin = 60) {
  const { data, error } = await admin.rpc('create_session', {
    p_name: 'Integration quiz',
    p_url_patterns: ['http://localhost:4173/exam/*'],
    p_starts_at: minutes(startOffsetMin),
    p_ends_at: minutes(endOffsetMin),
  });
  if (error) throw error;
  return data as { id: string; code: string };
}

const event = (attempt_id: string, occurred_at = new Date().toISOString()) => ({
  id: randomUUID(),
  attempt_id,
  type: 'exam_tab_hidden',
  occurred_at,
  details: {},
});

describe.skipIf(!testEnvConfigured)('M1 backend (icu-test)', () => {
  let adminA: SupabaseClient;
  let adminB: SupabaseClient;
  let student: SupabaseClient;

  beforeAll(async () => {
    await seedUsers();
    await resetData();
    [adminA, adminB, student] = await Promise.all([clientAs('adminA'), clientAs('adminB'), clientAs('student1')]);
  });

  it('T10: profiles carry the sign-up role, and the role cannot be changed', async () => {
    const { data: me } = await student.auth.getUser();
    const { data } = await student.from('profiles').select('role, full_name').eq('id', me.user!.id).single();
    expect(data).toEqual({ role: 'student', full_name: 'Student One' });
    const { data: updated } = await student.from('profiles').update({ role: 'admin' }).eq('id', me.user!.id).select();
    expect(updated ?? []).toHaveLength(0);
    const { data: after } = await serviceClient().from('profiles').select('role').eq('id', me.user!.id).single();
    expect(after?.role).toBe('student');
  });

  it('T11 (backend): wrong roles are rejected by the RPCs', async () => {
    const s = await createSession(adminA);
    expect((await adminA.rpc('join_session', { p_code: s.code })).error?.message).toMatch(/ICU_NOT_STUDENT/);
    const r = await student.rpc('create_session', { p_name: 'x', p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(0), p_ends_at: minutes(10) });
    expect(r.error?.message).toMatch(/ICU_NOT_ADMIN/);
    expect((await student.from('exam_sessions').select('id')).data).toEqual([]);
  });

  it('T13: each admin sees only their own sessions and attempts', async () => {
    const a = await createSession(adminA);
    const ids = (await adminB.from('exam_sessions').select('id')).data!.map((r) => r.id);
    expect(ids).not.toContain(a.id);
    expect((await adminB.from('attempts').select('id').eq('session_id', a.id)).data).toEqual([]);
  });

  it('T14: join_session cases', async () => {
    // Since migration 005 an unknown code is a result, not an error, so the failure is recorded (R6 rate limit).
    expect((await student.rpc('join_session', { p_code: 'ZZZZZZ' })).data).toEqual({ error: 'ICU_CODE_NOT_FOUND' });
    const ended = await createSession(adminA, -120, -60);
    expect((await student.rpc('join_session', { p_code: ended.code })).error?.message).toMatch(/ICU_SESSION_ENDED/);
    const future = await createSession(adminA, 60, 120);
    const joinedFuture = await student.rpc('join_session', { p_code: future.code });
    expect(joinedFuture.error).toBeNull();
    const startFuture = await student.rpc('start_attempt', { p_attempt_id: joinedFuture.data.attempt_id, p_consent_version: 'test', p_age_confirmed: true });
    expect(startFuture.error?.message).toMatch(/ICU_NOT_OPEN_YET/);
    const open = await createSession(adminA);
    const j1 = await student.rpc('join_session', { p_code: open.code });
    const j2 = await student.rpc('join_session', { p_code: open.code.toLowerCase() });
    expect(j2.data.attempt_id).toBe(j1.data.attempt_id);
  });

  it('T15–T17: consent, one active attempt, insert rules, server timestamps', async () => {
    await resetData();
    const s1 = await createSession(adminA);
    const s2 = await createSession(adminA);
    const a1 = (await student.rpc('join_session', { p_code: s1.code })).data.attempt_id as string;
    const a2 = (await student.rpc('join_session', { p_code: s2.code })).data.attempt_id as string;

    // T16: nothing before Start
    expect((await student.from('events').insert(event(a1))).error).not.toBeNull();

    // T15
    const noConsent = await student.rpc('start_attempt', { p_attempt_id: a1, p_consent_version: 'test', p_age_confirmed: false });
    expect(noConsent.error?.message).toMatch(/ICU_CONSENT_REQUIRED/);
    const started = await student.rpc('start_attempt', { p_attempt_id: a1, p_consent_version: 'test', p_age_confirmed: true });
    expect(started.error).toBeNull();
    const row = (await serviceClient().from('attempts').select('consent_at, consent_version, age_confirmed, started_at, status').eq('id', a1).single()).data!;
    expect(row).toMatchObject({ consent_version: 'test', age_confirmed: true, status: 'active' });
    expect(row.consent_at && row.started_at).toBeTruthy();
    const second = await student.rpc('start_attempt', { p_attempt_id: a2, p_consent_version: 'test', p_age_confirmed: true });
    expect(second.error?.message).toMatch(/ICU_ALREADY_ACTIVE/);

    // T16: during the attempt; duplicate ids; outside the window; no read/update/delete
    const ev = event(a1);
    expect((await student.from('events').insert(ev)).error).toBeNull();
    expect((await student.from('events').insert(ev)).error?.code).toBe('23505');
    expect((await student.from('events').insert(event(a1, minutes(-90)))).error).not.toBeNull();
    expect((await student.from('events').select('id')).data).toEqual([]);
    expect((await student.from('events').update({ type: 'copy' }).eq('id', ev.id).select()).data ?? []).toHaveLength(0);
    expect((await student.from('events').delete().eq('id', ev.id).select()).data ?? []).toHaveLength(0);
    expect((await adminA.from('events').select('id').eq('attempt_id', a1)).data).toHaveLength(1);
    expect((await adminB.from('events').select('id').eq('attempt_id', a1)).data).toEqual([]);

    // T17: client-supplied received_at is ignored
    expect((await student.from('heartbeats').insert({ attempt_id: a1, received_at: '2000-01-01T00:00:00Z' })).error).toBeNull();
    const hb = (await adminA.from('heartbeats').select('received_at').eq('attempt_id', a1)).data!;
    expect(Math.abs(Date.parse(hb[0]!.received_at) - Date.now())).toBeLessThan(10_000);

    // T16: after End, heartbeats are rejected; events within the 1 h grace are accepted
    expect((await student.rpc('end_attempt', { p_attempt_id: a1, p_reason: 'student' })).error).toBeNull();
    expect((await student.from('heartbeats').insert({ attempt_id: a1 })).error).not.toBeNull();
    expect((await student.from('events').insert(event(a1))).error).toBeNull();
  });
});
