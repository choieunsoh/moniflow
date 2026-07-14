import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeNodeProxyDb } from '@db/client';
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
  getFxRates,
  setFxRates,
  getFontScale,
  setFontScale,
  isFontScale,
  FONT_SCALE_PCT,
} from './queries';

describe('getCutoff / setCutoff', () => {
  it('defaults to 18 when no cutoff has been stored', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    expect(await getCutoff(db)).toBe(18);
  });

  it('round-trips a stored cutoff', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await setCutoff(db, 25);
    expect(await getCutoff(db)).toBe(25);
  });

  it('overwrites rather than duplicating on a second write', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await setCutoff(db, 25);
    await setCutoff(db, 5);
    expect(await getCutoff(db)).toBe(5);
  });
});

describe('getIconSet / setIconSet', () => {
  it('defaults to emoji when nothing is stored', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    expect(await getIconSet(db)).toBe('emoji');
  });

  it('round-trips a stored icon set', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await setIconSet(db, 'phosphor');
    expect(await getIconSet(db)).toBe('phosphor');
    await setIconSet(db, 'lucide');
    expect(await getIconSet(db)).toBe('lucide');
  });

  it('falls back to emoji if the stored value is somehow unknown', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await db.run(sql`INSERT INTO settings (key, value) VALUES ('icon_set', 'bogus')`);
    expect(await getIconSet(db)).toBe('emoji');
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
  it('defaults to 2.5 when nothing is stored', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    expect(await getCardFeePct(db)).toBe(2.5);
  });

  it('round-trips a stored fee and overwrites on re-write', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await setCardFeePct(db, 1.5);
    expect(await getCardFeePct(db)).toBe(1.5);
    await setCardFeePct(db, 0);
    expect(await getCardFeePct(db)).toBe(0);
  });

  it('falls back to 2.5 if the stored value is out of range', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await db.run(sql`INSERT INTO settings (key, value) VALUES ('card_fx_fee_pct', '999')`);
    expect(await getCardFeePct(db)).toBe(2.5);
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

describe('getFxRates / setFxRates', () => {
  it('defaults to an empty map', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    expect(await getFxRates(db)).toEqual({});
  });

  it('round-trips a rate map', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    const rates = { JPY: { thbPerUnit: 0.2043, asOf: '2026-07-13' } };
    await setFxRates(db, rates);
    expect(await getFxRates(db)).toEqual(rates);
  });

  it('returns {} when the stored blob is malformed', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await db.run(sql`INSERT INTO settings (key, value) VALUES ('fx_rates', 'not json')`);
    expect(await getFxRates(db)).toEqual({});
  });
});

describe('getFontScale / setFontScale', () => {
  it('defaults to md when nothing is stored', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    expect(await getFontScale(db)).toBe('md');
  });

  it('round-trips a stored scale and overwrites on re-write', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await setFontScale(db, 'lg');
    expect(await getFontScale(db)).toBe('lg');
    await setFontScale(db, 'sm');
    expect(await getFontScale(db)).toBe('sm');
  });

  it('falls back to md if the stored value is somehow unknown', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await db.run(sql`INSERT INTO settings (key, value) VALUES ('font_scale', 'huge')`);
    expect(await getFontScale(db)).toBe('md');
  });
});

describe('isFontScale', () => {
  it('accepts the four known scales and rejects everything else', () => {
    expect(isFontScale('sm')).toBe(true);
    expect(isFontScale('md')).toBe(true);
    expect(isFontScale('lg')).toBe(true);
    expect(isFontScale('xl')).toBe(true);
    expect(isFontScale('huge')).toBe(false);
    expect(isFontScale(undefined)).toBe(false);
    expect(isFontScale(2)).toBe(false);
  });
});

describe('FONT_SCALE_PCT', () => {
  it('maps every scale to a percent string', () => {
    expect(FONT_SCALE_PCT).toEqual({
      sm: '87.5%',
      md: '100%',
      lg: '112.5%',
      xl: '125%',
    });
  });
});
