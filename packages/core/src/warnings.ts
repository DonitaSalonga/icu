// Live warning policy (R17). Pure and serialisable so the service worker can persist it.
import { WARNING_TYPES, type EventType } from './events';

export const WARNING_COOLDOWN_MS = 10_000;

export interface WarningState {
  /** Warnings shown so far. */
  count: number;
  lastWarnAt?: number;
  limitReached: boolean;
}

export type WarningDecision =
  | { kind: 'none' }
  | { kind: 'warn'; n: number }
  | { kind: 'warn_and_limit'; n: number }
  | { kind: 'limit_reminder'; n: number };

export const initialWarningState = (): WarningState => ({ count: 0, limitReached: false });

/**
 * Decides whether an event shows a warning. Non-warning types and events within the cool-down
 * return none. The first time the count reaches the limit returns warn_and_limit; any later
 * warning returns limit_reminder (no second warning_limit_reached).
 */
export function decideWarning(
  state: WarningState,
  type: EventType,
  at: number,
  limit: number,
  cooldownMs: number = WARNING_COOLDOWN_MS,
): { decision: WarningDecision; next: WarningState } {
  if (!WARNING_TYPES.includes(type)) return { decision: { kind: 'none' }, next: state };
  if (state.lastWarnAt !== undefined && at - state.lastWarnAt < cooldownMs) {
    return { decision: { kind: 'none' }, next: state };
  }
  const n = state.count + 1;
  const next: WarningState = { count: n, lastWarnAt: at, limitReached: state.limitReached || n >= limit };
  if (state.limitReached) return { decision: { kind: 'limit_reminder', n }, next };
  if (n >= limit) return { decision: { kind: 'warn_and_limit', n }, next };
  return { decision: { kind: 'warn', n }, next };
}

/** Student-facing banner text (DSD.md § Content and voice). */
export const WARNING_TEXT: Partial<Record<EventType, string>> = {
  exam_tab_hidden: 'You left the exam tab.',
  window_blur: 'You switched away from the browser.',
  navigated_off_exam: 'You navigated away from the exam page.',
  paste: 'You pasted on the exam page.',
  fullscreen_exit: 'You left fullscreen.',
  screen_share_stopped: 'You stopped sharing your screen. Open ICU and choose Share screen again.',
};

export const LIMIT_REACHED_TEXT = "You've reached the warning limit. Your examiner will review this session.";
