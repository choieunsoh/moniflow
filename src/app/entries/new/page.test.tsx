import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EntryRow } from '@features/entries/schema';
import type { NewEntryData } from '@features/entries/use-new-entry';

const { params } = vi.hoisted(() => ({ params: { copy: '' } }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(params.copy ? `copy=${params.copy}` : ''),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@features/entries/use-new-entry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/entries/use-new-entry')>()),
  useNewEntry: vi.fn(),
}));

import { useNewEntry } from '@features/entries/use-new-entry';
import NewEntryPage from './page';

const template: EntryRow = {
  id: 42,
  date: '2026-08-14', // deliberately NOT today
  time: '08:15',
  accountId: 1,
  categoryId: 1,
  amount: -10,
  currency: 'THB',
  originalAmount: null,
  note: 'ทิป grab food',
  source: 'manual',
  offBudget: null,
  category: 'Grab Food',
  account: 'Cash',
};

function data(overrides: Partial<NewEntryData>): NewEntryData {
  return {
    categories: [],
    accounts: [],
    currencies: [{ code: 'THB', symbol: '฿' }],
    currencyCodes: new Set(['THB']),
    notes: [],
    noteSuggestions: [],
    rates: {},
    ratesAsOf: {},
    defaultAccount: 'Cash',
    iconSet: 'emoji',
    keypadLayout: 'calc',
    offBudgetCategories: new Set(),
    travelCurrencies: new Set(),
    template: null,
    ...overrides,
  };
}

// ?copy= re-opens the keypad on an existing row. The point of the feature is the repeat purchase —
// the same ฿10 tip keyed several times a week — so what carries over is the amount, note, account
// and category, and what must NOT is the original date: the copy is being spent today.
describe('new entry page — ?copy=', () => {
  beforeEach(() => {
    params.copy = '';
  });

  it('pre-fills the note from the copied row but dates it today', () => {
    params.copy = '42';
    vi.mocked(useNewEntry).mockReturnValue({ ready: true, data: data({ template }) });

    const { container } = render(<NewEntryPage />);

    expect(container.querySelector<HTMLInputElement>('input[name="note"]')?.value).toBe(
      'ทิป grab food',
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    // A copy is a NEW row: posting the source id would turn the save into an edit of it.
    expect(container.querySelector('input[name="id"]')).toBeNull();
  });

  it('asks the hook for the row named by ?copy=', () => {
    params.copy = '42';
    vi.mocked(useNewEntry).mockReturnValue({ ready: true, data: data({ template }) });
    render(<NewEntryPage />);
    expect(useNewEntry).toHaveBeenCalledWith(42);
  });

  // A hand-typed or truncated URL must not become a query for entry NaN.
  it('ignores a non-numeric copy id', () => {
    params.copy = 'abc';
    vi.mocked(useNewEntry).mockReturnValue({ ready: true, data: data({}) });
    render(<NewEntryPage />);
    expect(useNewEntry).toHaveBeenCalledWith(undefined);
  });
});
