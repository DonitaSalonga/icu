import { describe, expect, it } from 'vitest';
import { AI_SUGGESTION_LABELS, confidenceLevel } from '../src/ai';
import { findGaps } from '../src/gaps';
import { buildAnalysisState, buildRequest, gapsFor, MAX_TIMELINE, SUGGESTIONS, VERDICT_QUESTION, type AnalysisInput } from '../../../supabase/functions/_shared/analysis';

const t0 = Date.parse('2026-11-14T02:00:00.000Z');
const at = (s: number) => new Date(t0 + s * 1000).toISOString();
const beats = (from: number, to: number) => Array.from({ length: Math.floor((to - from) / 15) + 1 }, (_, i) => at(from + i * 15));

const input = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({
  startedAt: at(0),
  endAt: at(1800),
  warningLimit: 3,
  heartbeats: [...beats(0, 600), ...beats(700, 1800)],
  screenshots: [{ id: 'shot-1', visible_host: 'chatgpt.com', visible_path: '/c/abc' }],
  events: [
    { type: 'fullscreen_enter', occurred_at: at(1), details: {}, screenshot_id: null },
    { type: 'exam_tab_hidden', occurred_at: at(192), details: {}, screenshot_id: 'shot-1' },
    { type: 'url_visited', occurred_at: at(193), details: { host: 'chatgpt.com', path: '/c/abc' }, screenshot_id: null },
    { type: 'exam_tab_visible', occurred_at: at(220), details: { away_ms: 28_000 }, screenshot_id: null },
    { type: 'warning_shown', occurred_at: at(192), details: { n: 1, limit: 3 }, screenshot_id: null },
    { type: 'paste', occurred_at: at(225), details: { frame: 'top' }, screenshot_id: 'shot-1' },
  ],
  ...over,
});

// T52 (R32)
describe('buildAnalysisState', () => {
  it('builds an ordered, relative-time timeline with screenshot sites and gaps', () => {
    const s = buildAnalysisState(input());
    expect(s.exam).toEqual({ duration_min: 30, warning_limit: 3, warnings_shown: 1, warning_limit_reached: false, monitoring_gaps: 1 });
    expect(s.timeline).toEqual([
      { t: '00:00', event: 'exam_started' },
      { t: '00:01', event: 'entered_fullscreen' },
      { t: '03:12', event: 'left_exam_tab', screenshot_shows: 'chatgpt.com/c/abc' },
      { t: '03:13', event: 'visited_site', site: 'chatgpt.com/c/abc' },
      { t: '03:40', event: 'returned_to_exam_tab', away_s: 28 },
      { t: '03:45', event: 'pasted_on_exam_page', screenshot_shows: 'chatgpt.com/c/abc' },
      { t: '10:00', event: 'monitoring_lost', duration_s: 100 },
      { t: '30:00', event: 'exam_ended' },
    ]);
    expect(s.counts).toMatchObject({ left_exam_tab: 1, visited_site: 1, pasted_on_exam_page: 1, monitoring_lost: 1 });
  });

  it('contains no names, emails, UUIDs or absolute timestamps', () => {
    // The question text mentions "the student" generically; the per-attempt state must carry no identifiers.
    const json = JSON.stringify(buildRequest(input()).state);
    expect(json).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-|2026-|shot-1|attempt|student/i);
  });

  it('caps the timeline but keeps every important event', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ type: 'copy', occurred_at: at(i), details: {}, screenshot_id: null }));
    const s = buildAnalysisState(input({ events: [...many, { type: 'paste', occurred_at: at(1700), details: {}, screenshot_id: null }] }));
    expect(s.truncated).toBe(true);
    expect(s.timeline.length).toBeLessThanOrEqual(MAX_TIMELINE + 2);
    expect(s.timeline.some((e) => e.event === 'pasted_on_exam_page')).toBe(true);
    expect(s.counts.copied_on_exam_page).toBe(400);
  });

  it('sends exactly one Choice question', () => {
    const req = buildRequest(input());
    expect(Object.keys(req.questions)).toEqual(['verdict']);
    expect(req.questions.verdict.type).toBe('choice');
  });
});

// T53 (R32)
describe('parity', () => {
  it('option keys match between the model question and the dashboard labels', () => {
    expect(Object.keys(VERDICT_QUESTION.criteria)).toEqual([...SUGGESTIONS]);
    expect(Object.keys(AI_SUGGESTION_LABELS)).toEqual([...SUGGESTIONS]);
  });

  it('gapsFor matches findGaps', () => {
    const cases = [[], beats(0, 300), [...beats(70, 200), ...beats(400, 500)], [at(0), at(60), at(120)]];
    for (const hb of cases) {
      const ts = findGaps(hb.map((h) => new Date(h)), new Date(at(0)), new Date(at(600))).map((g) => [g.start.getTime(), g.end.getTime()]);
      expect(gapsFor(hb, at(0), at(600)).map((g) => [g.start, g.end])).toEqual(ts);
    }
  });

  it('confidence levels', () => {
    expect([0.9, 0.7, 0.5, 0.39].map(confidenceLevel)).toEqual(['High', 'High', 'Medium', 'Low']);
  });
});
