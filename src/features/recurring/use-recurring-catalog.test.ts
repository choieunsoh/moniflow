import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureRecurrencesTable, type NewRecurrence } from './schema';
import { addRule, listRules } from './queries';
import { categoryIdFor, setCategoryEmoji, setCategoryHue } from '@features/categories/queries';
import { accountIdFor } from '@features/accounts/queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useRecurringCatalog } from './use-recurring-catalog';

const netflix: NewRecurrence = {
  name: 'Netflix',
  day: 5,
  intervalMonths: 1,
  amount: 9.99,
  currency: 'USD',
  startDate: '2026-07-05',
};

describe('useRecurringCatalog', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureRecurrencesTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then resolves rule/category/account display names', async () => {
    const db = await getBrowserDb();
    const categoryId = await categoryIdFor(db, 'Streaming');
    await setCategoryEmoji(db, 'Streaming', '🎬');
    await setCategoryHue(db, 'Streaming', 200);
    const accountId = await accountIdFor(db, 'Visa');
    await addRule(db, { ...netflix, categoryId, accountId });
    const [rule] = await listRules(db);

    const { result } = renderHook(() => useRecurringCatalog());
    expect(result.current.ready).toBe(false);
    expect(result.current.catalog).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { catalog } = result.current;
    expect(catalog).not.toBeNull();
    if (catalog === null) throw new Error('unreachable — checked above');

    expect(catalog.metaById[rule.id]).toMatchObject({
      categoryName: 'Streaming',
      categoryEmoji: '🎬',
      categoryHue: 200,
      accountName: 'Visa',
    });
    expect(catalog.iconSet).toBe('emoji');
  });

  it('refetches when the data-version bumps after a rule is added', async () => {
    const db = await getBrowserDb();
    const { result } = renderHook(() => useRecurringCatalog());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.catalog?.metaById).toEqual({});

    const categoryId = await categoryIdFor(db, 'Streaming');
    const accountId = await accountIdFor(db, 'Cash');
    await addRule(db, { ...netflix, categoryId, accountId });
    act(() => bumpDataVersion());

    await waitFor(() =>
      expect(Object.values(result.current.catalog?.metaById ?? {})).toContainEqual(
        expect.objectContaining({ categoryName: 'Streaming', accountName: 'Cash' }),
      ),
    );
  });
});
