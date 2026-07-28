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
      parseCatalogJson(JSON.stringify({ version: 5, categories: [], accounts: [] })),
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

  it('rejects a version outside 1–4', () => {
    expect(
      parseCatalogJson(JSON.stringify({ version: 5, categories: [], accounts: [] })),
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

describe('catalog v4 currency catalog', () => {
  it('round-trips a v4 backup carrying the currency catalog', () => {
    const data: CatalogData = {
      version: 4,
      categories: [],
      accounts: [],
      recurrences: [],
      currencies: [
        { code: 'THB', offBudget: false, sortOrder: 0, archived: false },
        { code: 'JPY', offBudget: true, sortOrder: 1, archived: false },
        { code: 'GBP', offBudget: false, sortOrder: null, archived: true },
      ],
    };
    expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
  });

  it('still parses a v3 backup with no currencies key', () => {
    const data: CatalogData = { version: 3, categories: [], accounts: [], recurrences: [] };
    expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
  });

  it('rejects a currencies array whose rows are misshaped', () => {
    const text = JSON.stringify({
      version: 4,
      categories: [],
      accounts: [],
      recurrences: [],
      currencies: [{ code: 'JPY' }],
    });
    expect(parseCatalogJson(text)).toBeNull();
  });
});

describe('category off_budget in the catalog', () => {
  const withFlag = (offBudget: boolean) =>
    JSON.stringify({
      version: 3,
      categories: [
        { name: 'Insurance', emoji: '🛡️', hue: null, sortOrder: 0, archived: false, offBudget },
      ],
      accounts: [],
      recurrences: [],
    });

  it('round-trips a category flagged off-budget', () => {
    for (const flag of [true, false]) {
      const parsed = parseCatalogJson(withFlag(flag));
      expect(parsed?.categories[0].offBudget).toBe(flag);
    }
  });

  // Every backup written before this field existed omits it. Those files must still restore, and an
  // absent flag must stay UNDEFINED rather than defaulting to false — restore uses that distinction to
  // leave an existing category's flag alone instead of clearing it.
  it('still parses a pre-existing backup with no offBudget, leaving it undefined', () => {
    const old = JSON.stringify({
      version: 1,
      categories: [{ name: 'Food', emoji: '🍔', hue: 12, sortOrder: 0, archived: false }],
      accounts: [],
      recurrences: [],
    });
    const parsed = parseCatalogJson(old);
    expect(parsed).not.toBeNull();
    expect(parsed?.categories[0].offBudget).toBeUndefined();
  });

  it('rejects a non-boolean offBudget', () => {
    const bad = JSON.stringify({
      version: 3,
      categories: [
        { name: 'X', emoji: '🍔', hue: null, sortOrder: 0, archived: false, offBudget: 1 },
      ],
      accounts: [],
      recurrences: [],
    });
    expect(parseCatalogJson(bad)).toBeNull();
  });
});
