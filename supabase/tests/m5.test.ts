// M5 integration tests against icu-test (QAD.md T21, T23, T24). Edge Functions must be deployed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientAs, resetData, seedUsers, serviceClient, TEST_URL, testEnvConfigured } from '../scripts/testEnv';

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
const cronSecret = (() => {
  try {
    return /^ICU_CRON_SECRET=(.+)$/m.exec(readFileSync(join(import.meta.dirname, '../../.env.db.test'), 'utf8'))?.[1] ?? '';
  } catch {
    return '';
  }
})();

describe.skipIf(!testEnvConfigured)('M5 privacy and lifecycle (icu-test)', () => {
  let adminA: SupabaseClient;
  let student: SupabaseClient;
  const db = () => serviceClient();

  beforeAll(async () => {
    await seedUsers();
    await resetData();
    [adminA, student] = await Promise.all([clientAs('adminA'), clientAs('student1')]);
  });

  async function started(startOffsetMin = -1) {
    const session = (await adminA.rpc('create_session', { p_name: 'M5', p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(startOffsetMin), p_ends_at: minutes(60) })).data as { id: string; code: string };
    const attemptId = (await student.rpc('join_session', { p_code: session.code })).data.attempt_id as string;
    await db().from('attempts').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('status', 'active');
    const start = await student.rpc('start_attempt', { p_attempt_id: attemptId, p_consent_version: 't', p_age_confirmed: true });
    expect(start.error).toBeNull();
    return { session, attemptId, token: start.data.uninstall_token as string };
  }

  it('T23: uninstall beacon records once per token and always answers the same', async () => {
    const { attemptId, token } = await started();
    const call = (q: string) => fetch(`${TEST_URL}/functions/v1/uninstall-beacon${q}`);
    const responses = [await call(`?t=${token}`), await call(`?t=${token}`), await call(`?t=${randomUUID()}`), await call('')];
    const bodies = await Promise.all(responses.map((r) => r.text()));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(bodies).size).toBe(1);
    const { data } = await db().from('events').select('type').eq('attempt_id', attemptId).eq('type', 'extension_uninstalled');
    expect(data).toHaveLength(1);
    expect((await db().from('attempts').select('uninstall_token').eq('id', attemptId).single()).data!.uninstall_token).toBeNull();
  });

  it('T24: join rate limit after 10 failed codes in 10 minutes', async () => {
    const me = (await student.auth.getUser()).data.user!.id;
    await db().from('join_failures').delete().eq('user_id', me);
    const session = (await adminA.rpc('create_session', { p_name: 'RL', p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(-1), p_ends_at: minutes(60) })).data as { code: string };
    for (let i = 0; i < 10; i++) {
      expect((await student.rpc('join_session', { p_code: 'ZZZZZZ' })).data).toEqual({ error: 'ICU_CODE_NOT_FOUND' });
    }
    expect((await student.rpc('join_session', { p_code: 'ZZZZZZ' })).error?.message).toMatch(/ICU_RATE_LIMITED/);
    expect((await student.rpc('join_session', { p_code: session.code })).error?.message).toMatch(/ICU_RATE_LIMITED/);
    await db().from('join_failures').delete().eq('user_id', me);
    expect((await student.rpc('join_session', { p_code: session.code })).error).toBeNull();
  });

  it.skipIf(!cronSecret)('T21: retention deletes data 30+ days after the end, keeps newer data, needs the secret', async () => {
    const old = await started();
    const recent = await started();
    const seedData = async (sessionId: string, attemptId: string) => {
      const id = randomUUID();
      const path = `${sessionId}/${attemptId}/${id}.jpg`;
      expect((await student.storage.from('screenshots').upload(path, jpeg(), { contentType: 'image/jpeg' })).error).toBeNull();
      await student.from('screenshots').insert({ id, attempt_id: attemptId, storage_path: path, captured_at: new Date().toISOString(), reason: 'interval', bytes: 4 });
      await student.from('events').insert({ id: randomUUID(), attempt_id: attemptId, type: 'copy', occurred_at: new Date().toISOString() });
      await student.from('heartbeats').insert({ attempt_id: attemptId });
    };
    await seedData(old.session.id, old.attemptId);
    await seedData(recent.session.id, recent.attemptId);
    await db().from('attempts').update({ status: 'ended', ended_at: days(-31) }).eq('id', old.attemptId);
    await db().from('attempts').update({ status: 'ended', ended_at: days(-29) }).eq('id', recent.attemptId);

    const url = `${TEST_URL}/functions/v1/retention-cleanup`;
    const denied = await fetch(url, { method: 'POST' });
    expect(denied.status).toBe(401);
    expect((await db().from('events').select('id').eq('attempt_id', old.attemptId)).data).toHaveLength(1);

    const res = await fetch(url, { method: 'POST', headers: { 'x-icu-cron-secret': cronSecret } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attempts: number; failures: string[] };
    expect(body.failures).toEqual([]);

    for (const table of ['events', 'heartbeats', 'screenshots']) {
      expect((await db().from(table).select('attempt_id').eq('attempt_id', old.attemptId)).data, table).toEqual([]);
      expect((await db().from(table).select('attempt_id').eq('attempt_id', recent.attemptId)).data, table).toHaveLength(1);
    }
    expect((await db().storage.from('screenshots').list(`${old.session.id}/${old.attemptId}`)).data).toEqual([]);
    expect((await db().storage.from('screenshots').list(`${recent.session.id}/${recent.attemptId}`)).data).toHaveLength(1);
    expect((await db().from('attempts').select('data_deleted_at').eq('id', old.attemptId).single()).data!.data_deleted_at).toBeTruthy();
  });

});
