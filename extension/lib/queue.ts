// Upload queue persisted in chrome.storage.local (R16, R30). SDD.md § Key flows F3 "Queue flush".
// Order: screenshot object → screenshot row → events, so event → screenshot links always resolve.
// Events and screenshots carry client-generated UUIDs. A retried insert that was already saved fails
// with a unique violation (23505) and counts as saved; a batch is then re-sent row by row. Plain
// inserts are used instead of ON CONFLICT DO NOTHING, which PostgreSQL 18 also checks against select
// policies (students have none). See decision D4.
import { WEIGHTS, type EventType } from '@icu/core';
import { base64ToBlob } from './capture';
import { createLock } from './lock';
import { getSupabase } from './supabase';

export interface QueuedEvent {
  id: string;
  attempt_id: string;
  type: EventType;
  occurred_at: string;
  details: Record<string, unknown>;
  screenshot_id?: string;
}

export interface QueuedShot {
  id: string;
  attempt_id: string;
  session_id: string;
  captured_at: string;
  reason: 'interval' | 'violation';
  bytes: number;
  /** JPEG bytes, base64 (chrome.storage holds JSON only). */
  data: string;
  failures: number;
}

const EVENTS_KEY = 'icu-queue';
const SHOTS_KEY = 'icu-shots';
const DROPPED_KEY = 'icu-queue-dropped';
const BATCH_SIZE = 50;
const MAX_EVENTS = 1000;
const MAX_SHOTS = 20;
const MAX_SHOT_FAILURES = 5;
const UNIQUE_VIOLATION = '23505';
const MAX_BACKOFF_MS = 5 * 60_000;
const withLock = createLock();

async function get<T>(key: string): Promise<T[]> {
  return ((await browser.storage.local.get(key))[key] as T[] | undefined) ?? [];
}
const set = (key: string, items: unknown[]) => browser.storage.local.set({ [key]: items });

interface Dropped {
  events: number;
  screenshots: number;
}

async function addDropped(events: number, screenshots: number): Promise<void> {
  if (!events && !screenshots) return;
  const got = (await browser.storage.local.get(DROPPED_KEY))[DROPPED_KEY] as Dropped | undefined;
  await browser.storage.local.set({ [DROPPED_KEY]: { events: (got?.events ?? 0) + events, screenshots: (got?.screenshots ?? 0) + screenshots } });
}

/** Unlinks queued events from screenshots that will never be uploaded. Caller holds the lock. */
async function unlinkShots(ids: Set<string>): Promise<void> {
  const events = await get<QueuedEvent>(EVENTS_KEY);
  await set(EVENTS_KEY, events.map((e) => (e.screenshot_id && ids.has(e.screenshot_id) ? { ...e, screenshot_id: undefined } : e)));
}

/** R30: at most 1,000 queued events; drop the oldest weight-0 events first, then the oldest. */
export function enqueue(event: QueuedEvent): Promise<void> {
  return withLock(async () => {
    const items = [...(await get<QueuedEvent>(EVENTS_KEY)), event];
    let dropped = 0;
    while (items.length > MAX_EVENTS) {
      const zero = items.findIndex((e) => WEIGHTS[e.type] === 0);
      items.splice(zero >= 0 ? zero : 0, 1);
      dropped++;
    }
    await set(EVENTS_KEY, items);
    await addDropped(dropped, 0);
  });
}

/** R30: at most 20 queued screenshots; the oldest are dropped first. */
export function enqueueShot(shot: QueuedShot): Promise<void> {
  return withLock(async () => {
    const shots = [...(await get<QueuedShot>(SHOTS_KEY)), shot];
    const dropped = shots.splice(0, Math.max(0, shots.length - MAX_SHOTS));
    await set(SHOTS_KEY, shots);
    if (dropped.length) {
      await unlinkShots(new Set(dropped.map((s) => s.id)));
      await addDropped(0, dropped.length);
    }
  });
}

export async function queueSize(): Promise<number> {
  return (await get(EVENTS_KEY)).length + (await get(SHOTS_KEY)).length;
}

const isDuplicate = (error: { message?: string; statusCode?: string | number; code?: string }) =>
  error.code === UNIQUE_VIOLATION || String(error.statusCode) === '409' || /duplicate|already exists/i.test(error.message ?? '');

/** Uploads one screenshot object and its row; throws if either fails. */
async function uploadShot(shot: QueuedShot): Promise<void> {
  const supabase = getSupabase();
  const path = `${shot.session_id}/${shot.attempt_id}/${shot.id}.jpg`;
  const { error: uploadError } = await supabase.storage.from('screenshots').upload(path, base64ToBlob(shot.data), { contentType: 'image/jpeg', upsert: false });
  if (uploadError && !isDuplicate(uploadError as never)) throw uploadError;
  const { error: rowError } = await supabase.from('screenshots').insert({
    id: shot.id,
    attempt_id: shot.attempt_id,
    storage_path: path,
    captured_at: shot.captured_at,
    reason: shot.reason,
    bytes: shot.bytes,
  });
  if (rowError && rowError.code !== UNIQUE_VIOLATION) throw rowError;
}

async function flushShots(): Promise<void> {
  for (;;) {
    const [shot] = await get<QueuedShot>(SHOTS_KEY);
    if (!shot) return;
    try {
      await uploadShot(shot);
      await withLock(async () => set(SHOTS_KEY, (await get<QueuedShot>(SHOTS_KEY)).filter((s) => s.id !== shot.id)));
    } catch (error) {
      const failures = shot.failures + 1;
      if (failures < MAX_SHOT_FAILURES) {
        await withLock(async () => set(SHOTS_KEY, (await get<QueuedShot>(SHOTS_KEY)).map((s) => (s.id === shot.id ? { ...s, failures } : s))));
        throw error;
      }
      // Give up on this screenshot: unlink its events and record why (R16).
      await withLock(async () => {
        await set(SHOTS_KEY, (await get<QueuedShot>(SHOTS_KEY)).filter((s) => s.id !== shot.id));
        await unlinkShots(new Set([shot.id]));
      });
      await enqueue({ id: crypto.randomUUID(), attempt_id: shot.attempt_id, type: 'screenshot_failed', occurred_at: new Date().toISOString(), details: { error: 'upload' } });
    }
  }
}

async function insertEvents(batch: QueuedEvent[]): Promise<string[]> {
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

async function flushEvents(): Promise<void> {
  for (;;) {
    // Events whose screenshot is still queued wait for it (foreign key).
    const pending = new Set((await get<QueuedShot>(SHOTS_KEY)).map((s) => s.id));
    const batch = (await get<QueuedEvent>(EVENTS_KEY)).filter((e) => !e.screenshot_id || !pending.has(e.screenshot_id)).slice(0, BATCH_SIZE);
    if (batch.length === 0) return;
    const saved = new Set(await insertEvents(batch));
    await withLock(async () => set(EVENTS_KEY, (await get<QueuedEvent>(EVENTS_KEY)).filter((e) => !saved.has(e.id))));
  }
}

/** After an overflow, report how much was dropped (R30), once the queue drains. */
async function reportDropped(attemptId: string | undefined): Promise<void> {
  const dropped = (await browser.storage.local.get(DROPPED_KEY))[DROPPED_KEY] as Dropped | undefined;
  if (!dropped || !attemptId) return;
  await browser.storage.local.remove(DROPPED_KEY);
  await enqueue({
    id: crypto.randomUUID(),
    attempt_id: attemptId,
    type: 'queue_overflow',
    occurred_at: new Date().toISOString(),
    details: { dropped_events: dropped.events, dropped_screenshots: dropped.screenshots },
  });
}

let flushing: Promise<void> | undefined;
/** Set when flush is requested while one is running, so items queued meanwhile aren't stranded. */
let flushAgain = false;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

export const isUploadFailing = () => failures > 0;

/**
 * Uploads queued screenshots, then events. On failure, retries with exponential backoff
 * (1 s → 5 min, with jitter); the heartbeat alarm also calls flush as a safety net.
 */
export function flush(attemptId?: string): Promise<void> {
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  flushing = (async () => {
    try {
      const firstAttempt = (await get<QueuedEvent>(EVENTS_KEY))[0]?.attempt_id ?? attemptId;
      await flushShots();
      await flushEvents();
      failures = 0;
      await reportDropped(firstAttempt);
    } catch (error) {
      failures++;
      const delay = Math.min(1000 * 2 ** (failures - 1), MAX_BACKOFF_MS) * (0.8 + Math.random() * 0.4);
      console.warn(`[icu] upload failed; retrying in ${Math.round(delay / 1000)} s`, error);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void flush(), delay);
    } finally {
      flushing = undefined;
      if (flushAgain && failures === 0) {
        flushAgain = false;
        void flush();
      }
    }
  })();
  return flushing;
}
