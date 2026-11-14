import { describe, expect, it } from 'vitest';
import { generateSessionCode, normalizeSessionCode, SESSION_CODE_ALPHABET, SESSION_CODE_RE } from '../src/code';

// T8 (R4)
describe('generateSessionCode', () => {
  it('produces 6 characters from the 32-character alphabet, never I, O, 0 or 1', () => {
    let seed = 42;
    const seeded = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    expect(SESSION_CODE_ALPHABET).toHaveLength(32);
    for (let i = 0; i < 10_000; i++) {
      const code = generateSessionCode(seeded);
      expect(code).toMatch(SESSION_CODE_RE);
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('normalises typed codes', () => {
    expect(normalizeSessionCode(' 7kq-2mx ')).toBe('7KQ2MX');
  });
});
