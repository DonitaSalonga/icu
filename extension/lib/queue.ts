// Event queue persisted in chrome.storage.local (R30; M1 = basic, backoff and caps arrive in M2).
// Events carry client-generated UUIDs. A retried batch that was already saved fails with a
// unique violation (23505); the batch is then re-sent row by row and duplicates are skipped.
// Plain inserts are used instead of ON CONFLICT DO NOTHING, which PostgreSQL 18 also checks
// against select policies (students have none). See decision D4.
import type { EventType } from '@ocm/core';
import { getSupabase } from './supabase';
import { createLock } from './lock';

export interface QueuedEvent {
  id: string;
  attempt_id: string;
  type: EventType;
  occurred_at: string;
  details: Record<string, unknown>;
}

const KEY = 'ocm-queue';
const BATCH_SIZE = 50;
const UNIQUE_VIOLATION = '23505';
const withLock = createLock();

async function read(): Promise<QueuedEvent[]> {
  const got = await browser.storage.local.get(KEY);
  return (got[KEY] as QueuedEvent[] | undefined) ?? [];
}

async function write(items: QueuedEvent[]): Promise<void> {
  await browser.storage.local.set({ [KEY]: items });
}

export function enqueue(event: QueuedEvent): Promise<void> {
  return withLock(async () => {
    await write([...(await read()), event]);
  });
}

export async function queueSize(): Promise<number> {
  return (await read()).length;
}

async function insertBatch(batch: QueuedEvent[]): Promise<string[]> {
  const supabase = getSupabase();
  const { error } = await supabase.from('events').insert(batch);
  if (!error) return batch.map((e) => e.id);
  if (error.code !== UNIQUE_VIOLATION) throw error;

  const saved: string[] = [];
  for (const event of batch) {
    const { error: rowError } = await supabase.from('events').insert(event);
    if (!rowError || rowError.code === UNIQUE_VIOLATION) saved.push(event.id);
    else throw rowError;
  }
  return saved;
}

let flushing: Promise<void> | undefined;

/** Uploads queued events in batches. Failed events stay queued for the next flush. */
export function flush(): Promise<void> {
  flushing ??= (async () => {
    try {
      for (;;) {
        const batch = (await read()).slice(0, BATCH_SIZE);
        if (batch.length === 0) return;
        const saved = new Set(await insertBatch(batch));
        await withLock(async () => write((await read()).filter((e) => !saved.has(e.id))));
      }
    } catch (error) {
      console.warn('[ocm] queue flush failed; will retry', error);
    } finally {
      flushing = undefined;
    }
  })();
  return flushing;
}
