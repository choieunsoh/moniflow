import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureCurrenciesTable } from './schema';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { setFxRates } from '@features/settings/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useCurrencies } from './use-currencies';

describe('useCurrencies', () => {
  let db: Db;

  beforeEach(async () => {
    db = makeNodeProxyDb();
    await ensureCurrenciesTable(db);
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then returns the seeded catalog', async () => {
    const { result } = renderHook(() => useCurrencies());
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    const codes = result.current.data?.rows.map((r) => r.code) ?? [];
    expect(codes[0]).toBe('THB');
    expect(codes).toContain('MOP');
  });

  it('exposes the fx rate and its asOf date per currency', async () => {
    await setFxRates(db, { JPY: { thbPerUnit: 0.234, asOf: '2026-07-27' } });
    const { result } = renderHook(() => useCurrencies());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const jpy = result.current.data?.rows.find((r) => r.code === 'JPY');
    expect(jpy?.thbPerUnit).toBe(0.234);
    expect(jpy?.asOf).toBe('2026-07-27');
  });
});
