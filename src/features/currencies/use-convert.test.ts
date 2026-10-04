import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureCurrenciesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { setFxRates, setCardFeePct } from '@features/settings/queries';
import { setCurrencyArchived } from './queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useConvert } from './use-convert';

describe('useConvert', () => {
  let db: Db;

  beforeEach(async () => {
    db = makeNodeProxyDb();
    await ensureCurrenciesTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then returns visible codes, rates and the card fee', async () => {
    await setFxRates(db, { JPY: { thbPerUnit: 0.22, asOf: '2026-10-02' } });
    await setCardFeePct(db, 2);
    const { result } = renderHook(() => useConvert());
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.codes[0]).toBe('THB');
    expect(result.current.data?.codes).toContain('JPY');
    expect(result.current.data?.rates.JPY?.thbPerUnit).toBe(0.22);
    expect(result.current.data?.cardFeePct).toBe(2);
  });

  it('leaves out archived currencies', async () => {
    const first = renderHook(() => useConvert());
    await waitFor(() => expect(first.result.current.ready).toBe(true)); // seeds the catalog
    await setCurrencyArchived(db, 'MOP', true);
    const { result } = renderHook(() => useConvert());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.codes).not.toContain('MOP');
  });
});
