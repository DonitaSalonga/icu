import { describe, expect, it } from 'vitest';
import { findGaps } from '../src/gaps';

// T3 (R14)
const t0 = new Date('2026-11-14T02:00:00.000Z');
const at = (s: number) => new Date(t0.getTime() + s * 1000);
const beats = (from: number, to: number, every = 15) => {
  const out: Date[] = [];
  for (let s = from; s <= to; s += every) out.push(at(s));
  return out;
};

describe('findGaps', () => {
  it('no heartbeats → one gap covering the whole attempt', () => {
    expect(findGaps([], at(0), at(300))).toEqual([{ start: at(0), end: at(300), durationMs: 300_000 }]);
  });

  it('regular 15 s beats → no gaps', () => {
    expect(findGaps(beats(0, 600), at(0), at(600))).toEqual([]);
  });

  it('one 90 s hole → one gap', () => {
    const hb = [...beats(0, 120), ...beats(210, 600)];
    expect(findGaps(hb, at(0), at(600))).toEqual([{ start: at(120), end: at(210), durationMs: 90_000 }]);
  });

  it('a hole of exactly 60 s is not a gap; 60.001 s is', () => {
    expect(findGaps([at(0), at(60), at(120)], at(0), at(120))).toEqual([]);
    const late = new Date(at(60).getTime() + 1);
    expect(findGaps([at(0), late], at(0), late)).toHaveLength(1);
  });

  it('late first beat → leading gap', () => {
    expect(findGaps(beats(75, 300), at(0), at(300))).toEqual([{ start: at(0), end: at(75), durationMs: 75_000 }]);
  });

  it('early stop → trailing gap', () => {
    expect(findGaps(beats(0, 180), at(0), at(300))).toEqual([{ start: at(180), end: at(300), durationMs: 120_000 }]);
  });

  it('unsorted input and beats outside the window are handled', () => {
    const hb = [at(400), at(30), at(-50), at(0), at(15), at(45)];
    expect(findGaps(hb, at(0), at(100))).toEqual([]); // 45 → 100 s is 55 s, under the threshold
    expect(findGaps(hb, at(0), at(120))).toEqual([{ start: at(45), end: at(120), durationMs: 75_000 }]);
  });

  it('end before start → no gaps', () => {
    expect(findGaps([], at(100), at(0))).toEqual([]);
  });
});
