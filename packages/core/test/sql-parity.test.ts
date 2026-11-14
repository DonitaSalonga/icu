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
    // The latest definition wins: the original column check, or a later events_type_check constraint.
    const all = [...sql.matchAll(/(?:type text not null check \(type in|events_type_check check \(type in) \(([^)]*)\)\)/g)];
    expect(all.length, 'events.type check constraint not found').toBeGreaterThan(0);
    const sqlTypes = [...all.at(-1)![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(sqlTypes).toEqual([...EVENT_TYPES]);
  });

  it('session code alphabet matches in the check constraint and the generator', () => {
    expect(sql).toContain(`code ~ '^[${SESSION_CODE_ALPHABET}]{6}$'`);
    expect(sql).toContain(`alphabet constant text := '${SESSION_CODE_ALPHABET}'`);
  });
});
