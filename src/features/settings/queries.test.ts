import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import {
  getCutoff,
  setCutoff,
  isValidCutoffDay,
  getIconSet,
  setIconSet,
  isIconSet,
  getCardFeePct,
  setCardFeePct,
  isValidCardFeePct,
} from './queries';

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

describe('getIconSet / setIconSet', () => {
  it('defaults to emoji when nothing is stored', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    expect(getIconSet(db)).toBe('emoji');
  });

  it('round-trips a stored icon set', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    setIconSet(db, 'phosphor');
    expect(getIconSet(db)).toBe('phosphor');
    setIconSet(db, 'lucide');
    expect(getIconSet(db)).toBe('lucide');
  });

  it('falls back to emoji if the stored value is somehow unknown', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    db.run(sql`INSERT INTO settings (key, value) VALUES ('icon_set', 'bogus')`);
    expect(getIconSet(db)).toBe('emoji');
  });
});

describe('isIconSet', () => {
  it('accepts the three known sets and rejects everything else', () => {
    expect(isIconSet('emoji')).toBe(true);
    expect(isIconSet('phosphor')).toBe(true);
    expect(isIconSet('lucide')).toBe(true);
    expect(isIconSet('bogus')).toBe(false);
    expect(isIconSet(undefined)).toBe(false);
    expect(isIconSet(3)).toBe(false);
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

describe('getCardFeePct / setCardFeePct', () => {
  it('defaults to 2 when nothing is stored', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    expect(getCardFeePct(db)).toBe(2);
  });

  it('round-trips a stored fee and overwrites on re-write', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    setCardFeePct(db, 1.5);
    expect(getCardFeePct(db)).toBe(1.5);
    setCardFeePct(db, 0);
    expect(getCardFeePct(db)).toBe(0);
  });

  it('falls back to 2 if the stored value is out of range', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    db.run(sql`INSERT INTO settings (key, value) VALUES ('card_fx_fee_pct', '999')`);
    expect(getCardFeePct(db)).toBe(2);
  });
});

describe('isValidCardFeePct', () => {
  it('accepts 0..10 and rejects negatives, >10, and NaN', () => {
    expect(isValidCardFeePct(0)).toBe(true);
    expect(isValidCardFeePct(2)).toBe(true);
    expect(isValidCardFeePct(10)).toBe(true);
    expect(isValidCardFeePct(-1)).toBe(false);
    expect(isValidCardFeePct(10.5)).toBe(false);
    expect(isValidCardFeePct(Number.NaN)).toBe(false);
  });
});
