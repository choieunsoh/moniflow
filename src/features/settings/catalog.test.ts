import { describe, it, expect } from 'vitest';
import {
  serializeCatalogJson,
  parseCatalogJson,
  classifyBackup,
  type CatalogData,
} from './catalog';

const sample: CatalogData = {
  version: 1,
  categories: [{ name: 'Food', emoji: '🍔', hue: 12, sortOrder: 0, archived: false }],
  accounts: [{ name: 'Cash', icon: 'cash', hue: null, sortOrder: 1 }],
  recurrences: [],
};

describe('catalog serialize/parse', () => {
  it('round-trips a catalog', () => {
    expect(parseCatalogJson(serializeCatalogJson(sample))).toEqual(sample);
  });

  it('returns null on non-JSON', () => {
    expect(parseCatalogJson('not json')).toBeNull();
  });

  it('returns null on wrong/absent version', () => {
    expect(
      parseCatalogJson(JSON.stringify({ version: 4, categories: [], accounts: [] })),
    ).toBeNull();
    expect(parseCatalogJson(JSON.stringify({ categories: [], accounts: [] }))).toBeNull();
  });

  it('returns null when a category row is malformed', () => {
    const bad = JSON.stringify({ version: 1, categories: [{ name: 'X' }], accounts: [] });
    expect(parseCatalogJson(bad)).toBeNull();
  });
});

const sampleRule = {
  name: 'Netflix',
  category: 'Streaming',
  account: 'Visa',
  amount: 9.99,
  currency: 'USD',
  rate: null,
  day: 5,
  intervalMonths: 1,
  month: null,
  totalCount: null,
};

describe('catalog v2 with recurrences', () => {
  it('round-trips a rule through serialize → parse', () => {
    const data = {
      version: 2 as const,
      categories: [],
      accounts: [],
      recurrences: [sampleRule],
    };
    expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
  });

  it('round-trips a yearly rule that carries a month', () => {
    const yearly = { ...sampleRule, name: 'Domain', intervalMonths: 12, month: 3 };
    const data = { version: 2 as const, categories: [], accounts: [], recurrences: [yearly] };
    expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
  });

  it('accepts a v1 file (no recurrences key) and yields an empty array — back-compat', () => {
    const v1 = JSON.stringify({ version: 1, categories: [], accounts: [] });
    expect(parseCatalogJson(v1)).toEqual({
      version: 1,
      categories: [],
      accounts: [],
      recurrences: [],
    });
  });

  it('rejects the whole file when a rule row is malformed', () => {
    const bad = JSON.stringify({
      version: 2,
      categories: [],
      accounts: [],
      recurrences: [{ ...sampleRule, amount: 'lots' }],
    });
    expect(parseCatalogJson(bad)).toBeNull();
  });

  it('rejects a version outside 1–3', () => {
    expect(
      parseCatalogJson(JSON.stringify({ version: 4, categories: [], accounts: [] })),
    ).toBeNull();
  });
});

const MONEFY_CSV =
  'date,account,category,amount,currency,converted amount,currency,description\n' +
  '15/01/2016,cash,food,-637,THB,-637,THB,lunch';

describe('catalog v3 combined backup', () => {
  it('round-trips a v3 file carrying an embedded ledger CSV, budgets, and settings', () => {
    const data: CatalogData = {
      version: 3,
      categories: [],
      accounts: [],
      recurrences: [],
      entriesCsv: MONEFY_CSV,
      budgets: [
        { category: 'Food', amount: 5000 },
        { category: null, amount: 20000 }, // the whole-cycle total row
      ],
      settings: [
        { key: 'cutoff_day', value: '18' },
        { key: 'font_scale', value: 'lg' },
      ],
    };
    expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
  });

  it('rejects a v3 file whose entriesCsv is not a string', () => {
    const bad = JSON.stringify({
      version: 3,
      categories: [],
      accounts: [],
      recurrences: [],
      entriesCsv: 42,
    });
    expect(parseCatalogJson(bad)).toBeNull();
  });

  it('rejects a v3 file with a malformed budget or setting row', () => {
    const badBudget = JSON.stringify({
      version: 3,
      categories: [],
      accounts: [],
      recurrences: [],
      budgets: [{ category: 'Food', amount: 'lots' }],
    });
    expect(parseCatalogJson(badBudget)).toBeNull();
    const badSetting = JSON.stringify({
      version: 3,
      categories: [],
      accounts: [],
      recurrences: [],
      settings: [{ key: 'font_scale', value: 5 }],
    });
    expect(parseCatalogJson(badSetting)).toBeNull();
  });
});

describe('classifyBackup', () => {
  it('flags a v3 file as combined (replaces the ledger)', () => {
    const text = serializeCatalogJson({
      version: 3,
      categories: [],
      accounts: [],
      recurrences: [],
      entriesCsv: MONEFY_CSV,
    });
    const result = classifyBackup(text);
    expect(result.kind).toBe('combined');
    if (result.kind === 'combined') {
      expect(result.data).toMatchObject({ version: 3, entriesCsv: MONEFY_CSV });
    }
  });

  it('flags a v1/v2 file as catalog (merge-only)', () => {
    const text = serializeCatalogJson(sample);
    expect(classifyBackup(text)).toMatchObject({ kind: 'catalog' });
  });

  it('flags a bare Monefy CSV by its header', () => {
    expect(classifyBackup(MONEFY_CSV)).toEqual({ kind: 'monefy-csv' });
  });

  it('flags unrecognized junk as invalid', () => {
    expect(classifyBackup('just some junk')).toEqual({ kind: 'invalid' });
  });
});
