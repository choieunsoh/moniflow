import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from '@features/settings/schema';
import { setCardFeePct, setFxRates } from '@features/settings/queries';
import { ensureRecurrencesTable } from './schema';
import { addRule } from './queries';
import type { NewRecurrence } from './schema';

// Seeds a REAL in-memory db and mocks only @db/browser — the style use-budgets-page.test.ts
// established. The previous module-mock (`vi.mock('./queries', ...)`) broke the moment this hook
// started reading the FX cache to price a live-rate rule, which is exactly the brittleness a
// full-module mock buys you.
vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useRecurring } from './use-recurring';

const rent: NewRecurrence = {
  name: 'Rent',
  day: 1,
  intervalMonths: 1,
  accountId: 1,
  categoryId: 1,
  amount: 15000,
  currency: 'THB',
  startDate: '2026-07-01',
};

beforeEach(async () => {
  const db = makeNodeProxyDb();
  await ensureRecurrencesTable(db);
  await ensureSettingsTable(db);
  await setCardFeePct(db, 0); // a zero fee keeps the arithmetic below readable
  vi.mocked(getBrowserDb).mockResolvedValue(db);
});

describe('useRecurring', () => {
  it('starts not ready, then loads', async () => {
    const db = await getBrowserDb();
    await addRule(db, rent);

    const { result } = renderHook(() => useRecurring());
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rules).toHaveLength(1);
  });

  it('attaches installment progress', async () => {
    const db = await getBrowserDb();
    await addRule(db, { ...rent, totalCount: 12, startSeq: 4 });

    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rules[0].progress).toEqual({ paid: 3, total: 12, remaining: 9 });
  });

  it('normalises a yearly rule to a monthly figure in the total', async () => {
    const db = await getBrowserDb();
    await addRule(db, rent);
    await addRule(db, { ...rent, name: 'Domain', amount: 1200, intervalMonths: 12 });

    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    // Discriminates the amortisation: dropping it would sum to 16200, not 15100.
    expect(result.current.monthlyTotal).toBe(15100); // 15000 + 1200/12
  });

  it('values a pinned-rate FX rule at amount * rate / intervalMonths, with no network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const db = await getBrowserDb();
    await addRule(db, { ...rent, currency: 'USD', amount: 10, rate: 36, intervalMonths: 2 });

    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    // Discriminates both the × rate and the ÷ intervalMonths steps: 10 × 36 / 2 = 180, not 360 (no
    // ÷intervalMonths) and not 10 (no × rate).
    expect(result.current.rules[0].monthlyThb).toBe(180);
    expect(result.current.monthlyTotal).toBe(180);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('prices a live-rate FX rule at the CACHED rate, not zero', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const db = await getBrowserDb();
    await setFxRates(db, { USD: { thbPerUnit: 34, asOf: '2026-07-15' } });
    await addRule(db, { ...rent, currency: 'USD', amount: 10, rate: null, intervalMonths: 1 });

    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    // The regression this pins: falling back to 0 made a live-rate subscription contribute nothing,
    // so a page holding a $10/mo rule still reported "฿0 / month".
    expect(result.current.rules[0].monthlyThb).toBe(340);
    expect(result.current.monthlyTotal).toBe(340);
    // Priced from the LOCAL cache — the glance figure never reaches for the network.
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('layers the card fee onto the cached rate, matching what a post will cost', async () => {
    const db = await getBrowserDb();
    await setCardFeePct(db, 2.5);
    await setFxRates(db, { USD: { thbPerUnit: 34, asOf: '2026-07-15' } });
    await addRule(db, { ...rent, currency: 'USD', amount: 10, rate: null, intervalMonths: 1 });

    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    // The cache holds the ECB MID rate; the sweep charges mid × (1 + fee). Pricing the glance figure
    // at the bare mid would understate every foreign rule by the card fee.
    expect(result.current.rules[0].monthlyThb).toBeCloseTo(10 * 34 * 1.025, 6);
  });

  it('contributes 0 for a currency with no rate anywhere — not NaN, not the raw foreign amount', async () => {
    const db = await getBrowserDb();
    await addRule(db, { ...rent, currency: 'USD', amount: 10, rate: null, intervalMonths: 1 });

    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    // No pinned rate and nothing cached: there is no honest number, so 0 rather than an invention.
    expect(result.current.rules[0].monthlyThb).toBe(0);
    expect(result.current.monthlyTotal).toBe(0);
  });
});
