import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { getCutoff, setCutoff, isValidCutoffDay } from './queries';

describe('getCutoff / setCutoff', () => {
  it('defaults to 18 when no cutoff has been stored', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    expect(getCutoff(db)).toBe(18);
  });

  it('round-trips a stored cutoff', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    setCutoff(db, 25);
    expect(getCutoff(db)).toBe(25);
  });

  it('overwrites rather than duplicating on a second write', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    setCutoff(db, 25);
    setCutoff(db, 5);
    expect(getCutoff(db)).toBe(5);
  });
});

describe('isValidCutoffDay', () => {
  it('accepts integers in 1..28', () => {
    expect(isValidCutoffDay(1)).toBe(true);
    expect(isValidCutoffDay(18)).toBe(true);
    expect(isValidCutoffDay(28)).toBe(true);
  });

  it('rejects 0, 29, non-integers, and NaN', () => {
    expect(isValidCutoffDay(0)).toBe(false);
    expect(isValidCutoffDay(29)).toBe(false);
    expect(isValidCutoffDay(18.5)).toBe(false);
    expect(isValidCutoffDay(Number.NaN)).toBe(false);
  });
});
