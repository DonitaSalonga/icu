import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, GAP_WEIGHT, WEIGHTS } from '../src/events';
import { scoreAttempt, scoreFromCounts } from '../src/scoring';

const T = { threshold_medium: 10, threshold_high: 25 };

// T4 (R18)
describe('scoreAttempt weights', () => {
  it.each(EVENT_TYPES.map((t) => [t]))('%s scores its weight', (type) => {
    expect(scoreAttempt([{ type }], 0, { threshold_medium: 1000, threshold_high: 2000 }).score).toBe(WEIGHTS[type]);
  });

  it.each([0, 1, 3])('%i gaps add 8 points each', (gaps) => {
    expect(scoreAttempt([], gaps, T).score).toBe(gaps * GAP_WEIGHT);
  });

  it('matches the SDD weight table', () => {
    expect(WEIGHTS).toMatchObject({ exam_tab_hidden: 2, window_blur: 2, navigated_off_exam: 3, tab_opened: 1, copy: 1, cut: 1, context_menu: 1, paste: 3, fullscreen_exit: 2, exam_page_not_detected: 8, extension_uninstalled: 8 });
    expect(GAP_WEIGHT).toBe(8);
  });
});

// T5 (R18)
describe('risk levels', () => {
  const withScore = (n: number) => scoreFromCounts({ tab_opened: n }, 0, T);
  it.each([
    [9, 'low'],
    [10, 'medium'],
    [24, 'medium'],
    [25, 'high'],
  ])('score %i → %s', (n, level) => {
    expect(withScore(n).level).toBe(level);
  });

  it('warning_limit_reached forces High even with a low score', () => {
    const s = scoreFromCounts({ warning_limit_reached: 1 }, 0, T);
    expect(s.score).toBe(0);
    expect(s.level).toBe('high');
    expect(s.forcedHigh).toBe(true);
  });

  it('changing thresholds re-levels without changing the score', () => {
    const counts = { paste: 4 };
    expect(scoreFromCounts(counts, 0, T).level).toBe('medium');
    expect(scoreFromCounts(counts, 0, { threshold_medium: 5, threshold_high: 12 }).level).toBe('high');
    expect(scoreFromCounts(counts, 0, { threshold_medium: 5, threshold_high: 12 }).score).toBe(12);
  });
});

// T9 (R18, R20)
describe('breakdown', () => {
  it('sums to the score with correct counts per type', () => {
    const events = [...Array(3).fill({ type: 'exam_tab_hidden' }), { type: 'paste' }, { type: 'exam_tab_visible' }, { type: 'copy' }, { type: 'copy' }];
    const s = scoreAttempt(events, 2, T);
    expect(s.breakdown.reduce((n, r) => n + r.points, 0)).toBe(s.score);
    expect(s.breakdown).toEqual([
      { type: 'exam_tab_hidden', count: 3, points: 6 },
      { type: 'exam_tab_visible', count: 1, points: 0 },
      { type: 'copy', count: 2, points: 2 },
      { type: 'paste', count: 1, points: 3 },
      { type: 'monitoring_lost', count: 2, points: 16 },
    ]);
    expect(s.score).toBe(27);
    expect(s.level).toBe('high');
  });
});
