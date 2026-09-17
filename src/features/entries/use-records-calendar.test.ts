import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { addEntries } from './queries';
import { addRule } from '@features/recurring/queries';
import { categoryIdFor } from '@features/categories/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
vi.mock('@shared/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/date')>()),
  todayIso: vi.fn(() => '2026-07-05'),
}));

import { getBrowserDb } from '@db/browser';
import { useRecords, type RecordsParams } from './use-records';

// Cutoff defaults to 18 and today is pinned to 2026-07-05, so the current cycle is '2026-06'
// (18 Jun – 17 Jul, 30 days).
describe('useRecords — calendar view', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureRecurrencesTable(db);
    await ensureCurrenciesTable(db);
    await addEntries(db, [
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -40 },
      {
        date: '2026-07-02',
        account: 'Cash',
        category: 'Bills',
        amount: -1000,
        source: 'recurring',
      },
      { date: '2026-07-03', account: 'Cash', category: 'Food', amount: -500, offBudget: 1 },
    ]);
    // A ฿419 bill due the 10th: after today, inside the cycle, never posted.
    await addRule(db, {
      name: 'Netflix',
      day: 10,
      intervalMonths: 1,
      amount: 419,
      categoryId: await categoryIdFor(db, 'Bills'),
      startDate: '2026-07-10',
      lastPosted: null,
    });
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  async function load(params: RecordsParams) {
    const { result } = renderHook(() => useRecords(params));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const data = result.current.data;
    if (data === null) throw new Error('unreachable — ready implies data');
    return data;
  }

  it('builds cells from discretionary spend and marks each kind of day', async () => {
    const data = await load({ cycle: '2026-06', view: 'calendar' });
    expect(data.groupBy).toBe('calendar');
    const cal = data.calendar;
    if (cal === null) throw new Error('calendar view should build a calendar');
    expect(cal.cells).toHaveLength(30);
    const cell = (d: string) => cal.cells.find((c) => c.date === d);
    expect(cell('2026-07-01')).toEqual({ date: '2026-07-01', total: 140, intensity: 4 });
    expect(cell('2026-07-02')?.total).toBe(0); // a posted bill is not discretionary
    expect(cell('2026-07-03')?.total).toBe(0); // nor is off-budget spend
    expect(cal.marks.get('2026-07-02')).toEqual({
      posted: true,
      upcoming: false,
      offBudget: false,
    });
    expect(cal.marks.get('2026-07-03')).toEqual({
      posted: false,
      upcoming: false,
      offBudget: true,
    });
    expect(cal.marks.get('2026-07-10')).toEqual({
      posted: false,
      upcoming: true,
      offBudget: false,
    });
    expect(cal.marks.has('2026-07-01')).toBe(false);
  });

  it('opens on today by default', async () => {
    const data = await load({ cycle: '2026-06', view: 'calendar' });
    expect(data.calendar?.selectedDay).toBe('2026-07-05');
    expect(data.calendar?.dayEntries).toEqual([]);
  });

  it("lists the selected day's entries newest first with their total", async () => {
    const data = await load({ cycle: '2026-06', view: 'calendar', day: '2026-07-01' });
    const cal = data.calendar;
    if (cal === null) throw new Error('calendar view should build a calendar');
    expect(cal.selectedDay).toBe('2026-07-01');
    expect(cal.dayEntries.map((e) => e.amount)).toEqual([-40, -100]);
    expect(cal.dayTotal).toBe(-140);
    expect(cal.dayBills).toEqual([]);
  });

  it('lists an upcoming bill under its due day, in baht', async () => {
    const data = await load({ cycle: '2026-06', view: 'calendar', day: '2026-07-10' });
    const dayBills = data.calendar?.dayBills ?? [];
    expect(dayBills).toHaveLength(1);
    const [bill] = dayBills;
    expect(typeof bill.id).toBe('number');
    expect(bill).toEqual({
      id: bill.id,
      name: 'Netflix',
      category: 'Bills',
      amount: 419,
      currency: 'THB',
    });
  });

  it('narrows upcoming bills by the category filter', async () => {
    const food = await load({
      cycle: '2026-06',
      view: 'calendar',
      day: '2026-07-10',
      category: 'Food',
    });
    expect(food.calendar?.dayBills).toEqual([]);
    expect(food.calendar?.marks.has('2026-07-10')).toBe(false);
    const bills = await load({
      cycle: '2026-06',
      view: 'calendar',
      day: '2026-07-10',
      category: 'Bills',
    });
    expect(bills.calendar?.dayBills.map((b) => b.name)).toEqual(['Netflix']);
  });

  it('keeps date grouping and no calendar in search mode', async () => {
    const data = await load({ q: 'anything', view: 'calendar' });
    expect(data.groupBy).toBe('date');
    expect(data.calendar).toBeNull();
  });

  it('builds no calendar for the other views', async () => {
    const data = await load({ cycle: '2026-06' });
    expect(data.calendar).toBeNull();
  });
});
