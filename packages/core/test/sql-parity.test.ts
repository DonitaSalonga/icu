import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from '../src/events';
import { SESSION_CODE_ALPHABET } from '../src/code';

// One home per rule: the database constraints must match packages/core (SDD.md § Event catalogue).
const migrationsDir = join(import.meta.dirname, '../../../supabase/migrations');
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n');

describe('SQL ↔ packages/core parity', () => {
  it('events.type check lists exactly EVENT_TYPES', () => {
    const m = /type text not null check \(type in \(([^)]*)\)\)/.exec(sql);
    expect(m, 'events.type check constraint not found').not.toBeNull();
    const sqlTypes = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(sqlTypes).toEqual([...EVENT_TYPES]);
  });

  it('session code alphabet matches in the check constraint and the generator', () => {
    expect(sql).toContain(`code ~ '^[${SESSION_CODE_ALPHABET}]{6}$'`);
    expect(sql).toContain(`alphabet constant text := '${SESSION_CODE_ALPHABET}'`);
  });
});
