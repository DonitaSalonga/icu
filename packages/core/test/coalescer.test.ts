import { describe, expect, it } from 'vitest';
import { decideCapture, shouldCaptureInterval, type CaptureState } from '../src/coalescer';

// T7 (R16)
function simulate(triggersMs: number[]) {
  let state: CaptureState = {};
  const captures: number[] = [];
  const decisions = triggersMs.map((at, i) => {
    const d = decideCapture(state, at);
    if (d.kind === 'capture') {
      state = { lastCaptureAt: at, lastShotId: `shot-${i}` };
      captures.push(at);
      return 'capture';
    }
    return `attach:${d.shotId}`;
  });
  return { decisions, captures };
}

describe('decideCapture', () => {
  it('5 triggers within 3 s → one capture and 4 attaches; a trigger at 3.5 s captures again', () => {
    const { decisions } = simulate([0, 500, 1200, 2000, 2900, 3500]);
    expect(decisions).toEqual(['capture', 'attach:shot-0', 'attach:shot-0', 'attach:shot-0', 'attach:shot-0', 'capture']);
  });

  it('10 triggers 100 ms apart never produce two captures closer than 600 ms', () => {
    const { captures } = simulate(Array.from({ length: 10 }, (_, i) => i * 100));
    expect(captures).toEqual([0]);
  });

  it('long bursts capture at most once per 3 s (well under 2 per second)', () => {
    const { captures } = simulate(Array.from({ length: 100 }, (_, i) => i * 250));
    for (let i = 1; i < captures.length; i++) expect(captures[i]! - captures[i - 1]!).toBeGreaterThanOrEqual(3000);
  });

  it('interval captures are skipped right after another capture', () => {
    expect(shouldCaptureInterval({}, 0)).toBe(true);
    expect(shouldCaptureInterval({ lastCaptureAt: 1000, lastShotId: 'a' }, 2500)).toBe(false);
    expect(shouldCaptureInterval({ lastCaptureAt: 1000, lastShotId: 'a' }, 4000)).toBe(true);
  });
});
