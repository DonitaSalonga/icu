// AI suggestion input (R32): turns one attempt's monitoring data into an anonymous timeline and the
// single Choice question sent to the analysis model (decision D8). Pure, dependency-free TypeScript so
// the Edge Function (Deno) and the unit tests (Vitest) share it. No names, emails or IDs leave here.

export const SUGGESTIONS = ['cheating_ai_or_web', 'cheating_copy_paste', 'cheating_monitoring_off', 'needs_review', 'likely_fine'] as const;
export type Suggestion = (typeof SUGGESTIONS)[number];

/** The one Choice question (D8, Q31). Criteria are what the model reads; UI labels live in packages/core. */
export const VERDICT_QUESTION = {
  type: 'choice',
  instructions: "Based on this exam monitoring timeline, which best describes the student's behaviour during the exam?",
  criteria: {
    cheating_ai_or_web: 'Visited an AI chatbot, search engine or answer site during the exam, especially followed by pasting or returning to answer',
    cheating_copy_paste: 'Pasted outside content into the exam without a clear innocent reason',
    cheating_monitoring_off: 'Monitoring was switched off or the exam page was left for long periods',
    needs_review: 'Some suspicious events, but they could have an innocent explanation',
    likely_fine: 'Stayed on the exam, with only minor or no events',
  } satisfies Record<Suggestion, string>,
} as const;

export interface AnalysisInput {
  startedAt: string;
  /** min(ended_at ?? now, session ends_at) */
  endAt: string;
  warningLimit: number;
  events: { type: string; occurred_at: string; details: Record<string, unknown>; screenshot_id: string | null }[];
  heartbeats: string[];
  screenshots: { id: string; visible_host: string | null; visible_path: string | null }[];
}

export interface TimelineEntry {
  t: string;
  event: string;
  [key: string]: string | number | boolean;
}

export interface AnalysisState {
  exam: { duration_min: number; warning_limit: number; warnings_shown: number; warning_limit_reached: boolean; monitoring_gaps: number };
  counts: Record<string, number>;
  timeline: TimelineEntry[];
  truncated?: boolean;
}

export const MAX_TIMELINE = 200;
const GAP_THRESHOLD_MS = 60_000;

/** Same rule as packages/core findGaps (parity checked in tests): holes > 60 s, including both ends. */
export function gapsFor(heartbeats: readonly string[], startedAt: string, endAt: string): { start: number; end: number }[] {
  const start = Date.parse(startedAt);
  const end = Date.parse(endAt);
  if (!(end > start)) return [];
  const times = heartbeats.map((h) => Date.parse(h)).filter((t) => t >= start && t <= end).sort((a, b) => a - b);
  const gaps: { start: number; end: number }[] = [];
  let prev = start;
  for (const t of [...times, end]) {
    if (t - prev > GAP_THRESHOLD_MS) gaps.push({ start: prev, end: t });
    prev = Math.max(prev, t);
  }
  return gaps;
}

const NAMES: Record<string, string> = {
  exam_tab_hidden: 'left_exam_tab',
  exam_tab_visible: 'returned_to_exam_tab',
  window_blur: 'left_browser',
  window_focus: 'returned_to_browser',
  navigated_off_exam: 'navigated_off_exam_page',
  tab_opened: 'opened_new_tab',
  url_visited: 'visited_site',
  copy: 'copied_on_exam_page',
  cut: 'cut_on_exam_page',
  paste: 'pasted_on_exam_page',
  context_menu: 'right_clicked_on_exam_page',
  fullscreen_enter: 'entered_fullscreen',
  fullscreen_exit: 'left_fullscreen',
  exam_page_not_detected: 'exam_page_not_opened',
  warning_limit_reached: 'warning_limit_reached',
  extension_uninstalled: 'monitoring_extension_removed',
};
// warning_shown, screenshot_failed and queue_overflow are bookkeeping, not behaviour.
const IMPORTANT = new Set(['navigated_off_exam', 'url_visited', 'paste', 'exam_page_not_detected', 'warning_limit_reached', 'extension_uninstalled']);

const site = (host: unknown, path: unknown) => `${String(host ?? '')}${String(path ?? '')}`.slice(0, 200);

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Builds the anonymous state sent to the model. Times are relative to the start ("mm:ss"). */
export function buildAnalysisState(input: AnalysisInput): AnalysisState {
  const start = Date.parse(input.startedAt);
  const end = Date.parse(input.endAt);
  const shown = new Map(input.screenshots.map((s) => [s.id, s.visible_host ? site(s.visible_host, s.visible_path) : undefined]));
  const gaps = gapsFor(input.heartbeats, input.startedAt, input.endAt);

  type Row = { at: number; important: boolean; entry: TimelineEntry };
  const rows: Row[] = [];
  const counts: Record<string, number> = {};
  for (const e of input.events) {
    const name = NAMES[e.type];
    if (!name) continue;
    counts[name] = (counts[name] ?? 0) + 1;
    const at = Date.parse(e.occurred_at);
    const entry: TimelineEntry = { t: clock(at - start), event: name };
    if (typeof e.details.away_ms === 'number') entry.away_s = Math.round(e.details.away_ms / 1000);
    if (e.details.host !== undefined) entry.site = site(e.details.host, e.details.path);
    const seen = e.screenshot_id ? shown.get(e.screenshot_id) : undefined;
    if (seen) entry.screenshot_shows = seen;
    rows.push({ at, important: IMPORTANT.has(e.type), entry });
  }
  for (const g of gaps) {
    rows.push({ at: g.start, important: true, entry: { t: clock(g.start - start), event: 'monitoring_lost', duration_s: Math.round((g.end - g.start) / 1000) } });
  }
  if (gaps.length) counts.monitoring_lost = gaps.length;
  rows.sort((a, b) => a.at - b.at);

  // Bound the request size: keep every important row, then the earliest others, up to MAX_TIMELINE.
  let kept = rows;
  let truncated = false;
  if (rows.length > MAX_TIMELINE) {
    truncated = true;
    const important = rows.filter((r) => r.important);
    const others = rows.filter((r) => !r.important).slice(0, Math.max(0, MAX_TIMELINE - important.length));
    kept = [...important, ...others].sort((a, b) => a.at - b.at).slice(0, MAX_TIMELINE);
  }

  const warningsShown = input.events.filter((e) => e.type === 'warning_shown').length;
  const state: AnalysisState = {
    exam: {
      duration_min: Math.round(Math.max(0, end - start) / 60_000),
      warning_limit: input.warningLimit,
      warnings_shown: warningsShown,
      warning_limit_reached: input.events.some((e) => e.type === 'warning_limit_reached'),
      monitoring_gaps: gaps.length,
    },
    counts,
    timeline: [{ t: '00:00', event: 'exam_started' }, ...kept.map((r) => r.entry), { t: clock(end - start), event: 'exam_ended' }],
  };
  if (truncated) state.truncated = true;
  return state;
}

/** The full request body for the model API (one request, one question). */
export function buildRequest(input: AnalysisInput, model = 'jev-latest') {
  return { model, state: buildAnalysisState(input), questions: { verdict: VERDICT_QUESTION } };
}
