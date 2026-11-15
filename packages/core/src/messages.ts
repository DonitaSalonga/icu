// Typed runtime messages between extension parts (SDD.md § Extension internal messages).
import type { EventType } from './events';

export type Role = 'student' | 'admin';
export type AttemptState = 'idle' | 'joined' | 'active' | 'ended';

export interface SessionSummary {
  id: string;
  name: string;
  /** "Tell us about the exam", optional (2026-11-15). */
  description?: string | null;
  admin_name: string;
  admin_email: string;
  starts_at: string;
  ends_at: string;
  url_patterns: string[];
  warning_limit: number;
}

export interface JoinResult {
  attempt_id: string;
  status: 'joined' | 'active' | 'ended';
  session: SessionSummary;
}

export interface AttemptStatus {
  state: AttemptState;
  session?: SessionSummary;
  attempt_id?: string;
  started_at?: string;
  ended_at?: string;
  exam_tab_bound: boolean;
  queue_size: number;
  last_heartbeat_at?: string;
  warnings?: { n: number; limit: number };
  upload_failing?: boolean;
  /** Whole-screen sharing is live (D9). */
  screen_sharing?: boolean;
}

export type Message =
  | { type: 'auth.signUp'; email: string; password: string; full_name: string; role: Role }
  | { type: 'auth.signIn'; email: string; password: string }
  | { type: 'auth.signOut' }
  | { type: 'auth.state' }
  | { type: 'attempt.join'; code: string }
  | { type: 'attempt.openNotice' }
  | { type: 'attempt.start'; age_confirmed: boolean; consent_version: string }
  | { type: 'attempt.end' }
  | { type: 'attempt.status' }
  | { type: 'attempt.reset' }
  | { type: 'attempt.reshare' }
  | { type: 'attempt.focusExam' }
  | { type: 'screen.started' }
  | { type: 'screen.stopped' }
  | { type: 'cs.hello'; top: boolean }
  | { type: 'cs.event'; event_type: EventType; occurred_at: string; details: Record<string, unknown> }
  | { type: 'cs.heartbeat' };

/** Messages from the service worker to the content script in the exam tab. */
export type SwMessage =
  | { type: 'sw.activate' }
  | { type: 'sw.deactivate' }
  | { type: 'sw.showWarning'; n: number; limit: number; text: string; limitReached: boolean }
  | { type: 'monitor.stop' };

export interface AuthState {
  configured: boolean;
  signedIn: boolean;
  role?: Role;
  full_name?: string;
  email?: string;
}

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; code: string; message: string };
