// Event queue persisted in chrome.storage.local (R30).
// Events carry client-generated UUIDs. A retried batch that was already saved fails with a
// unique violation (23505); the batch is then re-sent row by row and duplicates are skipped.
// Plain inserts are used instead of ON CONFLICT DO NOTHING, which PostgreSQL 18 also checks
// against select policies (students have none). See decision D4.
import { WEIGHTS, type EventType } from '@ocm/core';
import { createLock } from './lock';
import { getSupabase } from './supabase';

export interface QueuedEvent {
  id: string;
  attempt_id: string;
  type: EventType;
  occurred_at: string;
  details: Record<string, unknown>;
}

const KEY = 'ocm-queue';
const DROPPED_KEY = 'ocm-queue-dropped';
const BATCH_SIZE = 50;
const MAX_EVENTS = 1000;
const UNIQUE_VIOLATION = '23505';
const MAX_BACKOFF_MS = 5 * 60_000;
const withLock = createLock();

async function read(): Promise<QueuedEvent[]> {
  const got = await browser.storage.local.get(KEY);
  return (got[KEY] as QueuedEvent[] | undefined) ?? [];
}

async function write(items: QueuedEvent[]): Promise<void> {
  await browser.storage.local.set({ [KEY]: items });
}

/** R30: at most 1,000 queued events; drop the oldest weight-0 events first, then the oldest. */
export function enqueue(event: QueuedEvent): Promise<void> {
  return withLock(async () => {
    const items = [...(await read()), event];
    let dropped = 0;
    while (items.length > MAX_EVENTS) {
      const zero = items.findIndex((e) => WEIGHTS[e.type] === 0);
      items.splice(zero >= 0 ? zero : 0, 1);
      dropped++;
    }
    await write(items);
    if (dropped > 0) {
      const got = await browser.storage.local.get(DROPPED_KEY);
      await browser.storage.local.set({ [DROPPED_KEY]: Number(got[DROPPED_KEY] ?? 0) + dropped });
    }
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
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

export const isUploadFailing = () => failures > 0;

/** After an overflow, report how many events were dropped (R30), once the queue drains. */
async function reportDropped(attemptId: string | undefined): Promise<void> {
  const got = await browser.storage.local.get(DROPPED_KEY);
  const dropped = Number(got[DROPPED_KEY] ?? 0);
  if (!dropped || !attemptId) return;
  await browser.storage.local.remove(DROPPED_KEY);
  await enqueue({
    id: crypto.randomUUID(),
    attempt_id: attemptId,
    type: 'queue_overflow',
    occurred_at: new Date().toISOString(),
    details: { dropped_events: dropped, dropped_screenshots: 0 },
  });
}

/**
 * Uploads queued events in batches. On failure, retries with exponential backoff
 * (1 s → 5 min, with jitter); the heartbeat alarm also calls flush as a safety net.
 */
export function flush(): Promise<void> {
  flushing ??= (async () => {
    let lastAttemptId: string | undefined;
    try {
      for (;;) {
        const batch = (await read()).slice(0, BATCH_SIZE);
        if (batch.length === 0) break;
        lastAttemptId = batch[0]?.attempt_id;
        const saved = new Set(await insertBatch(batch));
        await withLock(async () => write((await read()).filter((e) => !saved.has(e.id))));
      }
      failures = 0;
      await reportDropped(lastAttemptId);
    } catch (error) {
      failures++;
      const delay = Math.min(1000 * 2 ** (failures - 1), MAX_BACKOFF_MS) * (0.8 + Math.random() * 0.4);
      console.warn(`[ocm] queue flush failed; retrying in ${Math.round(delay / 1000)} s`, error);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void flush(), delay);
    } finally {
      flushing = undefined;
    }
  })();
  return flushing;
}
