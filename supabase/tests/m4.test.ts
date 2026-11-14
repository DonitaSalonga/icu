// M4 integration tests against icu-test (QAD.md T12, T19, T20, T22).
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findGaps } from '@icu/core';
import { deleteAttemptData } from '../../dashboard/src/lib/deleteAttempt';
import { clientAs, resetData, seedUsers, serviceClient, testEnvConfigured } from '../scripts/testEnv';

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });

describe.skipIf(!testEnvConfigured)('M4 review (icu-test)', () => {
  let adminA: SupabaseClient;
  let adminB: SupabaseClient;
  let student: SupabaseClient;

  beforeAll(async () => {
    await seedUsers();
    await resetData();
    [adminA, adminB, student] = await Promise.all([clientAs('adminA'), clientAs('adminB'), clientAs('student1')]);
  });

  async function startedAttempt(name = 'Review') {
    const session = (await adminA.rpc('create_session', { p_name: name, p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(-30), p_ends_at: minutes(60) })).data as { id: string; code: string };
    const attemptId = (await student.rpc('join_session', { p_code: session.code })).data.attempt_id as string;
    // One active attempt per student (R8): end the previous test's attempt first.
    await serviceClient().from('attempts').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('status', 'active');
    expect((await student.rpc('start_attempt', { p_attempt_id: attemptId, p_consent_version: 't', p_age_confirmed: true })).error).toBeNull();
    return { session, attemptId };
  }

  it('T12: create_session validation and unique codes', async () => {
    const bad = [
      { p_name: 'x', p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(10), p_ends_at: minutes(5) },
      { p_name: 'x', p_url_patterns: [], p_starts_at: minutes(0), p_ends_at: minutes(5) },
      { p_name: 'x', p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(0), p_ends_at: minutes(5), p_warning_limit: 0 },
      { p_name: 'x', p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(0), p_ends_at: minutes(5), p_warning_limit: 11 },
    ];
    for (const args of bad) expect((await adminA.rpc('create_session', args)).error?.message).toMatch(/ICU_INVALID_INPUT/);
    const codes = await Promise.all(
      Array.from({ length: 50 }, (_, i) => adminA.rpc('create_session', { p_name: `S${i}`, p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(0), p_ends_at: minutes(5) })),
    );
    expect(codes.every((c) => !c.error)).toBe(true);
    expect(new Set(codes.map((c) => c.data.code)).size).toBe(50);
    // Exam platforms typed by the admin (2026-11-15): keyword, domain, domain + path.
    const platforms = await adminA.rpc('create_session', { p_name: 'Platforms', p_url_patterns: ['netacad', 'skillsbuild.org', 'docs.google.com/forms'], p_starts_at: minutes(0), p_ends_at: minutes(5) });
    expect(platforms.error).toBeNull();
    for (const bad of [['two words'], ['exam!'], ['.com']]) {
      expect((await adminA.rpc('create_session', { p_name: 'x', p_url_patterns: bad, p_starts_at: minutes(0), p_ends_at: minutes(5) })).error?.message).toMatch(/ICU_INVALID_INPUT/);
    }
  });

  it('T19: verdicts are set by the session admin only and hidden from students', async () => {
    const { attemptId } = await startedAttempt();
    const ok = await adminA.rpc('set_verdict', { p_attempt_id: attemptId, p_verdict: 'suspicious', p_note: 'Left the tab twice' });
    expect(ok.error).toBeNull();
    const { data: row } = await adminA.from('attempts').select('verdict, verdict_note, verdict_by, verdict_at').eq('id', attemptId).single();
    expect(row).toMatchObject({ verdict: 'suspicious', verdict_note: 'Left the tab twice' });
    expect(row!.verdict_by && row!.verdict_at).toBeTruthy();
    expect((await adminB.rpc('set_verdict', { p_attempt_id: attemptId, p_verdict: 'cleared' })).error?.message).toMatch(/ICU_NOT_SESSION_ADMIN/);
    expect((await adminA.rpc('set_verdict', { p_attempt_id: attemptId, p_verdict: 'guilty' })).error?.message).toMatch(/ICU_INVALID_INPUT/);
    expect((await student.from('attempts').select('verdict')).data).toEqual([]);
  });

  it('T20: delete removes objects, rows, and marks the attempt; other admins are denied', async () => {
    const { session, attemptId } = await startedAttempt();
    const db = serviceClient();
    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      const path = `${session.id}/${attemptId}/${id}.jpg`;
      expect((await student.storage.from('screenshots').upload(path, jpeg(), { contentType: 'image/jpeg' })).error).toBeNull();
      expect((await student.from('screenshots').insert({ id, attempt_id: attemptId, storage_path: path, captured_at: new Date().toISOString(), reason: 'interval', bytes: 4 })).error).toBeNull();
    }
    await student.from('events').insert({ id: randomUUID(), attempt_id: attemptId, type: 'copy', occurred_at: new Date().toISOString() });
    await student.from('heartbeats').insert({ attempt_id: attemptId });

    // Rows can't be deleted while objects remain.
    expect((await adminA.rpc('delete_attempt_rows', { p_attempt_id: attemptId })).error?.message).toMatch(/ICU_STORAGE_NOT_EMPTY/);
    await expect(deleteAttemptData(adminB, session.id, attemptId)).rejects.toThrow();

    await deleteAttemptData(adminA, session.id, attemptId);
    for (const table of ['events', 'heartbeats', 'screenshots']) {
      expect((await db.from(table).select('attempt_id').eq('attempt_id', attemptId)).data).toEqual([]);
    }
    expect((await db.storage.from('screenshots').list(`${session.id}/${attemptId}`)).data).toEqual([]);
    expect((await db.from('attempts').select('data_deleted_at').eq('id', attemptId).single()).data!.data_deleted_at).toBeTruthy();
  });

  it('T22: SQL gap counts match findGaps', async () => {
    const db = serviceClient();
    const cases: number[][] = [
      [0, 15, 30, 45, 60, 75, 90, 105], // no holes
      [0, 15, 30, 120, 135, 150], // one 90 s hole
      [70, 85, 160, 175, 300, 315, 330, 345, 420], // leading + middle + middle + trailing
      [], // no heartbeats: one gap
      [0, 60, 120], // exactly 60 s: not a gap
    ];
    for (const offsets of cases) {
      const { session, attemptId } = await startedAttempt(`gaps ${offsets.length}`);
      const started = new Date(Date.now() - 10 * 60_000);
      const ended = new Date(started.getTime() + 8 * 60_000);
      await db.from('attempts').update({ started_at: started.toISOString(), ended_at: ended.toISOString(), status: 'ended' }).eq('id', attemptId);
      for (const s of offsets) {
        const { data } = await db.from('heartbeats').insert({ attempt_id: attemptId }).select('id').single();
        await db.from('heartbeats').update({ received_at: new Date(started.getTime() + s * 1000).toISOString() }).eq('id', data!.id);
      }
      const { data: rows, error } = await adminA.rpc('session_attempt_summaries', { p_session_id: session.id });
      expect(error).toBeNull();
      const sqlCount = rows!.find((r: { attempt_id: string }) => r.attempt_id === attemptId).gap_count;
      const tsCount = findGaps(offsets.map((s) => new Date(started.getTime() + s * 1000)), started, ended).length;
      expect(sqlCount, `offsets ${offsets.join(',')}`).toBe(tsCount);
    }
  });

  it('summaries are visible to the session admin only', async () => {
    const { session } = await startedAttempt();
    expect((await adminB.rpc('session_attempt_summaries', { p_session_id: session.id })).data).toEqual([]);
    expect((await student.rpc('session_attempt_summaries', { p_session_id: session.id })).data).toEqual([]);
  });
});
