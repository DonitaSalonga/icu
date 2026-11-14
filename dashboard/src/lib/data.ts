// Dashboard data access. Risk is always computed with packages/core (R18), never stored.
import { scoreFromCounts, type RiskLevel, type Score } from '@icu/core';
import { supabase } from '../supabase';

export interface SessionRow {
  id: string;
  name: string;
  code: string;
  url_patterns: string[];
  starts_at: string;
  ends_at: string;
  warning_limit: number;
  threshold_medium: number;
  threshold_high: number;
}

export interface AttemptSummary {
  attempt_id: string;
  student_id: string;
  full_name: string;
  email: string;
  status: 'joined' | 'active' | 'ended';
  started_at: string | null;
  ended_at: string | null;
  verdict: string | null;
  verdict_at: string | null;
  data_deleted_at: string | null;
  event_counts: Record<string, number>;
  gap_count: number;
}

export type ScoredAttempt = AttemptSummary & { risk: Score; warnings: number };

export const SESSION_COLUMNS = 'id, name, code, url_patterns, starts_at, ends_at, warning_limit, threshold_medium, threshold_high';

export function sessionStatus(s: Pick<SessionRow, 'starts_at' | 'ends_at'>): 'Upcoming' | 'Active' | 'Ended' {
  const now = Date.now();
  if (now < Date.parse(s.starts_at)) return 'Upcoming';
  if (now < Date.parse(s.ends_at)) return 'Active';
  return 'Ended';
}

/** Attempt status as shown to admins: an attempt past the session end is Ended (SDD F4/F6). */
export function attemptStatus(a: Pick<AttemptSummary, 'status'>, session: Pick<SessionRow, 'ends_at'>): string {
  if (a.status === 'active' && Date.now() >= Date.parse(session.ends_at)) return 'Ended';
  return { joined: 'Joined', active: 'In progress', ended: 'Ended' }[a.status];
}

export async function loadSummaries(session: SessionRow): Promise<ScoredAttempt[]> {
  const { data, error } = await supabase!.rpc('session_attempt_summaries', { p_session_id: session.id });
  if (error) throw error;
  return (data as AttemptSummary[]).map((a) => ({
    ...a,
    risk: scoreFromCounts(a.event_counts, a.gap_count, session),
    warnings: a.event_counts.warning_shown ?? 0,
  }));
}

export const RISK_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
