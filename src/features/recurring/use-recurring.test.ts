import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Recurrence } from './schema';

const listRules = vi.fn();
vi.mock('./queries', () => ({ listRules }));
vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn(() => Promise.resolve({})) }));

function rule(over: Partial<Recurrence>): Recurrence {
  return {
    id: 1,
    name: 'Rent',
    day: 1,
    intervalMonths: 1,
    accountId: 1,
    categoryId: 1,
    amount: 15000,
    currency: 'THB',
    rate: null,
    totalCount: null,
    startSeq: 1,
    startDate: '2026-07-01',
    lastPosted: null,
    archived: 0,
    ...over,
  };
}

beforeEach(() => {
  listRules.mockReset();
});

describe('useRecurring', () => {
  it('starts not ready, then loads', async () => {
    listRules.mockResolvedValue([rule({})]);
    const { useRecurring } = await import('./use-recurring');
    const { result } = renderHook(() => useRecurring());
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rules).toHaveLength(1);
  });

  it('attaches installment progress', async () => {
    listRules.mockResolvedValue([rule({ totalCount: 12, startSeq: 4 })]);
    const { useRecurring } = await import('./use-recurring');
    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rules[0].progress).toEqual({ paid: 3, total: 12, remaining: 9 });
  });

  it('normalises a yearly rule to a monthly figure in the total', async () => {
    listRules.mockResolvedValue([
      rule({ id: 1, amount: 15000, intervalMonths: 1 }),
      rule({ id: 2, name: 'Domain', amount: 1200, intervalMonths: 12 }),
    ]);
    const { useRecurring } = await import('./use-recurring');
    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.monthlyTotal).toBe(15100); // 15000 + 1200/12
  });

  it('values a pinned-rate FX rule at amount * rate / intervalMonths, with no network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    listRules.mockResolvedValue([
      rule({ id: 1, currency: 'USD', amount: 10, rate: 36, intervalMonths: 2 }),
    ]);
    const { useRecurring } = await import('./use-recurring');
    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    // Discriminates both the * rate and the / intervalMonths steps: 10 * 36 / 2 = 180, not 360 (no
    // /intervalMonths) and not 10 (no * rate).
    expect(result.current.rules[0].monthlyThb).toBe(180);
    expect(result.current.monthlyTotal).toBe(180);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('contributes 0 for an FX rule with no pinned rate — not NaN, not the raw foreign amount', async () => {
    listRules.mockResolvedValue([
      rule({ id: 1, currency: 'USD', amount: 10, rate: null, intervalMonths: 1 }),
    ]);
    const { useRecurring } = await import('./use-recurring');
    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rules[0].monthlyThb).toBe(0);
    expect(result.current.monthlyTotal).toBe(0);
  });
});
