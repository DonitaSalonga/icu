// Heartbeat gap detection (R14): push-based heartbeat with timeout-based failure detection.
// Uses server receive times only. A hole longer than thresholdMs is a "monitoring lost" gap.

export const GAP_THRESHOLD_MS = 60_000;

export interface Gap {
  start: Date;
  end: Date;
  durationMs: number;
}

/**
 * Finds monitoring gaps between `start` and `end`, including the leading gap
 * (start → first heartbeat) and the trailing gap (last heartbeat → end).
 * Heartbeats outside [start, end] are ignored. A hole of exactly thresholdMs is not a gap.
 */
export function findGaps(
  heartbeatTimes: readonly Date[],
  start: Date,
  end: Date,
  thresholdMs: number = GAP_THRESHOLD_MS,
): Gap[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!(endMs > startMs)) return [];

  const times = heartbeatTimes
    .map((d) => d.getTime())
    .filter((t) => t >= startMs && t <= endMs)
    .sort((a, b) => a - b);

  const gaps: Gap[] = [];
  let prev = startMs;
  for (const t of [...times, endMs]) {
    if (t - prev > thresholdMs) {
      gaps.push({ start: new Date(prev), end: new Date(t), durationMs: t - prev });
    }
    prev = Math.max(prev, t);
  }
  return gaps;
}
