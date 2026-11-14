import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, WARNING_TYPES } from '../src/events';
import { decideWarning, initialWarningState, type WarningState } from '../src/warnings';

// T6 (R17)
describe('decideWarning', () => {
  const run = (events: [string, number][], limit = 3) => {
    let state: WarningState = initialWarningState();
    return events.map(([type, s]) => {
      const { decision, next } = decideWarning(state, type as never, s * 1000, limit);
      state = next;
      return decision.kind === 'none' ? 'none' : `${decision.kind}(${decision.n})`;
    });
  };

  it('limit 3, 10 s cool-down: warnings at 0, 3, 11, 25, 40 s', () => {
    expect(run([['exam_tab_hidden', 0], ['paste', 3], ['window_blur', 11], ['fullscreen_exit', 25], ['navigated_off_exam', 40]])).toEqual([
      'warn(1)',
      'none',
      'warn(2)',
      'warn_and_limit(3)',
      'limit_reminder(4)',
    ]);
  });

  it('non-warning types never warn and do not start the cool-down', () => {
    const nonWarning = EVENT_TYPES.filter((t) => !WARNING_TYPES.includes(t));
    expect(run(nonWarning.map((t, i) => [t, i]))).toEqual(nonWarning.map(() => 'none'));
    expect(run([['copy', 0], ['exam_tab_hidden', 1]])).toEqual(['none', 'warn(1)']);
  });

  it('a limit of 1 reaches the limit on the first warning', () => {
    expect(run([['paste', 0], ['paste', 20]], 1)).toEqual(['warn_and_limit(1)', 'limit_reminder(2)']);
  });

  it('exactly 10 s after the last warning is outside the cool-down', () => {
    expect(run([['paste', 0], ['paste', 10]])).toEqual(['warn(1)', 'warn(2)']);
  });
});
