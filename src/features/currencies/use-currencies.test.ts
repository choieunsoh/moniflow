import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureCurrenciesTable } from './schema';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureSettingsTable } from '@features/settings/schema';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useCurrencies } from './use-currencies';

describe('useCurrencies', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
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
    const { result } = renderHook(() => useCurrencies());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const jpy = result.current.data?.rows.find((r) => r.code === 'JPY');
    expect(jpy).toBeDefined();
  });
});
