// Screenshot coalescing (R16). Events within 3 s of the last capture share its screenshot when the same
// site is on screen, which keeps captures far below Chrome's limit of 2 per second (RESEARCH F6).
// A different site on screen always gets its own capture. Pure and serialisable.

export const COALESCE_WINDOW_MS = 3_000;

export interface CaptureState {
  lastCaptureAt?: number;
  lastShotId?: string;
  /** host + path the last screenshot showed. */
  lastShotSite?: string;
}

export type CaptureDecision = { kind: 'capture' } | { kind: 'attach'; shotId: string };

/** For a warning event at `at` with `site` on screen: capture a new screenshot, or attach the recent one. */
export function decideCapture(state: CaptureState, at: number, site?: string, windowMs: number = COALESCE_WINDOW_MS): CaptureDecision {
  const sameSite = site === undefined || state.lastShotSite === undefined || site === state.lastShotSite;
  if (sameSite && state.lastShotId !== undefined && state.lastCaptureAt !== undefined && at - state.lastCaptureAt < windowMs) {
    return { kind: 'attach', shotId: state.lastShotId };
  }
  return { kind: 'capture' };
}

/** Interval screenshots are skipped when a capture happened within the window. */
export function shouldCaptureInterval(state: CaptureState, at: number, windowMs: number = COALESCE_WINDOW_MS): boolean {
  return state.lastCaptureAt === undefined || at - state.lastCaptureAt >= windowMs;
}
