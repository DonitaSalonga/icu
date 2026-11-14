// Risk scoring (R18). SDD.md § Risk scoring. One implementation used by the dashboard and the tests.
import { EVENT_TYPES, GAP_WEIGHT, WEIGHTS, type EventType } from './events';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Thresholds {
  threshold_medium: number;
  threshold_high: number;
}

export interface BreakdownRow {
  /** An event type, or 'monitoring_lost' for heartbeat gaps. */
  type: EventType | 'monitoring_lost';
  count: number;
  points: number;
}

export interface Score {
  score: number;
  level: RiskLevel;
  breakdown: BreakdownRow[];
  /** warning_limit_reached forces High regardless of the score. */
  forcedHigh: boolean;
}

/** Scores from per-type event counts and the number of monitoring gaps. */
export function scoreFromCounts(counts: Partial<Record<string, number>>, gapCount: number, thresholds: Thresholds): Score {
  const breakdown: BreakdownRow[] = [];
  for (const type of EVENT_TYPES) {
    const count = counts[type] ?? 0;
    if (count > 0) breakdown.push({ type, count, points: count * WEIGHTS[type] });
  }
  if (gapCount > 0) breakdown.push({ type: 'monitoring_lost', count: gapCount, points: gapCount * GAP_WEIGHT });
  const score = breakdown.reduce((sum, row) => sum + row.points, 0);
  const forcedHigh = (counts.warning_limit_reached ?? 0) > 0;
  const level: RiskLevel =
    forcedHigh || score >= thresholds.threshold_high ? 'high' : score >= thresholds.threshold_medium ? 'medium' : 'low';
  return { score, level, breakdown, forcedHigh };
}

/** Scores an attempt from its events and gaps. */
export function scoreAttempt(events: readonly { type: string }[], gapCount: number, thresholds: Thresholds): Score {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return scoreFromCounts(counts, gapCount, thresholds);
}
