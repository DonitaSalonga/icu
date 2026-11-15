// Attempt state machine persisted in chrome.storage.local, because the service worker may stop
// after 30 s idle and lose memory (RESEARCH F9). SDD.md § Components (service worker).
import type { CaptureState, SessionSummary, WarningState } from '@icu/core';

export interface StoredAttempt {
  attempt_id: string;
  session: SessionSummary;
  state: 'joined' | 'active' | 'ended';
  started_at?: string;
  ended_at?: string;
  /** server time − local time, measured at Start; events use server-corrected times. */
  clock_offset_ms: number;
  /** The tab the student was on when they clicked Continue: preferred as the exam tab at Start. */
  start_tab_id?: number;
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
  /** The exam window has been seen in fullscreen; until then ICU retries the request (macOS can ignore it). */
  fullscreen_seen?: boolean;
  fullscreen_tries?: number;
  not_detected_recorded?: boolean;
  warnings?: WarningState;
  /** Screenshot coalescing (R16). */
  shot?: CaptureState;
  last_heartbeat_at?: string;
  /** Whole-screen sharing (D9): the pinned notice tab that holds the stream. */
  monitor_tab_id?: number;
  /** The window holding the monitoring page (a small popup window, DSD v2); focusing it isn't leaving the exam. */
  monitor_window_id?: number;
  screen_sharing?: boolean;
  /** Last page seen in the exam tab, for exam_page_changed (rule 3). */
  last_exam_path?: string;
}

const KEY = 'icu-attempt';

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
