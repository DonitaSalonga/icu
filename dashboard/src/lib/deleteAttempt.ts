// R23: delete one candidate's monitoring data (SDD.md § Key flows F6 step 5).
// Storage objects first (batches of 100), then rows; delete_attempt_rows refuses while objects remain,
// so a partial failure can simply be retried.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function deleteAttemptData(db: SupabaseClient, sessionId: string, attemptId: string): Promise<void> {
  const bucket = db.storage.from('screenshots');
  const prefix = `${sessionId}/${attemptId}`;
  for (;;) {
    const { data: files, error } = await bucket.list(prefix, { limit: 100 });
    if (error) throw error;
    if (!files.length) break;
    const { data: removed, error: removeError } = await bucket.remove(files.map((f) => `${prefix}/${f.name}`));
    if (removeError) throw removeError;
    if (!removed?.length) throw new Error('ICU_STORAGE_DELETE_FAILED');
  }
  const { error } = await db.rpc('delete_attempt_rows', { p_attempt_id: attemptId });
  if (error) throw error;
}
