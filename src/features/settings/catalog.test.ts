import { describe, it, expect } from 'vitest';
import { serializeCatalogJson, parseCatalogJson, type CatalogData } from './catalog';

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
      parseCatalogJson(JSON.stringify({ version: 3, categories: [], accounts: [] })),
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

  it('rejects a version other than 1 or 2', () => {
    expect(
      parseCatalogJson(JSON.stringify({ version: 3, categories: [], accounts: [] })),
    ).toBeNull();
  });
});
