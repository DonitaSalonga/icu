// M3 integration tests against ocm-test (QAD.md T18): screenshot rows and Storage policies.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientAs, resetData, seedUsers, testEnvConfigured } from '../scripts/testEnv';

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
// Smallest valid JPEG header bytes; Storage only checks the declared content type.
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9])], { type: 'image/jpeg' });

describe.skipIf(!testEnvConfigured)('M3 screenshots (ocm-test)', () => {
  let adminA: SupabaseClient;
  let adminB: SupabaseClient;
  let student: SupabaseClient;
  let student2: SupabaseClient;
  let session: { id: string; code: string };
  let attemptId: string;
  let otherAttemptId: string;

  beforeAll(async () => {
    await seedUsers();
    await resetData();
    [adminA, adminB, student, student2] = await Promise.all([clientAs('adminA'), clientAs('adminB'), clientAs('student1'), clientAs('student2')]);
    session = (await adminA.rpc('create_session', { p_name: 'Shots', p_url_patterns: ['https://a.com/*'], p_starts_at: minutes(-1), p_ends_at: minutes(60) })).data;
    attemptId = (await student.rpc('join_session', { p_code: session.code })).data.attempt_id;
    otherAttemptId = (await student2.rpc('join_session', { p_code: session.code })).data.attempt_id;
    await student.rpc('start_attempt', { p_attempt_id: attemptId, p_consent_version: 'test', p_age_confirmed: true });
    await student2.rpc('start_attempt', { p_attempt_id: otherAttemptId, p_consent_version: 'test', p_age_confirmed: true });
  });

  it('T18: students upload only to their own attempt path; only the session admin can read', async () => {
    const id = randomUUID();
    const path = `${session.id}/${attemptId}/${id}.jpg`;
    const own = await student.storage.from('screenshots').upload(path, jpeg(), { contentType: 'image/jpeg' });
    expect(own.error).toBeNull();

    const foreign = await student.storage.from('screenshots').upload(`${session.id}/${otherAttemptId}/${randomUUID()}.jpg`, jpeg(), { contentType: 'image/jpeg' });
    expect(foreign.error).not.toBeNull();
    const badShape = await student.storage.from('screenshots').upload(`${session.id}/${attemptId}/notes.txt`, jpeg(), { contentType: 'image/jpeg' });
    expect(badShape.error).not.toBeNull();
    const wrongType = await student.storage.from('screenshots').upload(`${session.id}/${attemptId}/${randomUUID()}.jpg`, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' });
    expect(wrongType.error).not.toBeNull();

    // Students can't read back or delete, even their own.
    expect((await student.storage.from('screenshots').createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await student.storage.from('screenshots').remove([path])).data ?? []).toHaveLength(0);

    // Row insert + event link
    const row = { id, attempt_id: attemptId, storage_path: path, captured_at: new Date().toISOString(), reason: 'violation', bytes: 14 };
    expect((await student.from('screenshots').insert(row)).error).toBeNull();
    const ev = { id: randomUUID(), attempt_id: attemptId, type: 'exam_tab_hidden', occurred_at: new Date().toISOString(), screenshot_id: id };
    expect((await student.from('events').insert(ev)).error).toBeNull();

    // Session admin: signed URL with ≤ 1 h expiry works; another admin is denied.
    const signed = await adminA.storage.from('screenshots').createSignedUrl(path, 3600);
    expect(signed.error).toBeNull();
    expect((await fetch(signed.data!.signedUrl)).status).toBe(200);
    expect((await adminB.storage.from('screenshots').createSignedUrl(path, 3600)).error).not.toBeNull();
    expect((await adminA.from('screenshots').select('id').eq('attempt_id', attemptId)).data).toHaveLength(1);
    expect((await adminB.from('screenshots').select('id').eq('attempt_id', attemptId)).data).toEqual([]);

    // Session admin can delete; the event's link becomes null.
    expect((await adminB.storage.from('screenshots').remove([path])).data ?? []).toHaveLength(0);
    expect((await adminA.storage.from('screenshots').remove([path])).data).toHaveLength(1);
  });
});
