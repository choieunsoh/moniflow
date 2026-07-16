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
});
