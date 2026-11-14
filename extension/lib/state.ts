// Attempt state machine persisted in chrome.storage.local, because the service worker may stop
// after 30 s idle and lose memory (RESEARCH F9). SDD.md § Components (service worker).
import type { CaptureState, SessionSummary, WarningState } from '@ocm/core';

export interface StoredAttempt {
  attempt_id: string;
  session: SessionSummary;
  state: 'joined' | 'active' | 'ended';
  started_at?: string;
  ended_at?: string;
  /** server time − local time, measured at Start; events use server-corrected times. */
  clock_offset_ms: number;
  exam_tab_id?: number;
  exam_window_id?: number;
  /** Server-corrected ms when the exam tab was hidden, while it is hidden (R10). */
  hidden_at?: number;
  /** Server-corrected ms when the browser lost focus, while it is unfocused (R10). */
  blurred_at?: number;
  /** The exam tab is currently on a non-exam URL (R9). */
  off_exam?: boolean;
  /** Last known state of the exam window, for fullscreen enter/exit (R13). */
  window_state?: string;
  fullscreen_requested?: boolean;
  not_detected_recorded?: boolean;
  warnings?: WarningState;
  /** Screenshot coalescing (R16). */
  shot?: CaptureState;
  last_heartbeat_at?: string;
}

const KEY = 'ocm-attempt';

export async function loadAttempt(): Promise<StoredAttempt | undefined> {
  const got = await browser.storage.local.get(KEY);
  return got[KEY] as StoredAttempt | undefined;
}

export async function saveAttempt(attempt: StoredAttempt): Promise<void> {
  await browser.storage.local.set({ [KEY]: attempt });
}

export async function updateAttempt(patch: Partial<StoredAttempt>): Promise<StoredAttempt | undefined> {
  const current = await loadAttempt();
  if (!current) return undefined;
  const next = { ...current, ...patch };
  await saveAttempt(next);
  return next;
}

export async function clearAttempt(): Promise<void> {
  await browser.storage.local.remove(KEY);
}

export function serverNow(attempt: Pick<StoredAttempt, 'clock_offset_ms'>): number {
  return Date.now() + attempt.clock_offset_ms;
}
