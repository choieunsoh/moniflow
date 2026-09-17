import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { EntryRow } from '../schema';
import type { RecordsCalendar as CalendarData } from '../use-records';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { RecordsCalendar } from './RecordsCalendar';

const LUNCH: EntryRow = {
  id: 1,
  date: '2026-07-10',
  time: null,
  accountId: 1,
  categoryId: 1,
  amount: -240,
  currency: 'THB',
  originalAmount: null,
  note: 'Lunch',
  source: 'manual',
  offBudget: null,
  category: 'Food',
  account: 'Cash',
};

function calendar(over: Partial<CalendarData> = {}): CalendarData {
  return {
    cells: [{ date: '2026-07-10', total: 240, intensity: 4 }],
    marks: new Map(),
    selectedDay: '2026-07-10',
    dayEntries: [LUNCH],
    dayTotal: -240,
    dayBills: [
      { id: 7, name: 'Netflix', category: 'Bills', amount: 419, currency: 'THB' },
      { id: 8, name: 'GitHub', category: 'Bills', amount: 4, currency: 'USD' },
    ],
    ...over,
  };
}

function renderCalendar(data: CalendarData): void {
  render(
    <CategoryPickerProvider iconSet="emoji">
      <RecordsCalendar
        calendar={data}
        hrefFor={(d) => `/records?view=calendar&day=${d}`}
        emojiMap={{}}
        hueMap={{}}
        iconSet="emoji"
      />
    </CategoryPickerProvider>,
  );
}

describe('RecordsCalendar', () => {
  it('heads the list with the selected day and its total', () => {
    renderCalendar(calendar());
    const heading = screen.getByRole('heading', { name: /Fri 10 Jul/ });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    // dayTotal is -240 (one ฿240 spend). Scoped to the heading's own row (not the section, which
    // also has a ฿240.00 row for the entry itself) so it can't accidentally match another figure.
    const headerRow = heading.closest('div');
    expect(headerRow).not.toBeNull();
    if (headerRow === null) throw new Error('unreachable — checked above');
    expect(within(headerRow).getByText('฿240.00')).toBeInTheDocument();
  });

  it('lists upcoming bills as links to their rule, in baht or their own currency', () => {
    renderCalendar(calendar());
    const netflix = screen.getByRole('link', { name: /Netflix/ });
    expect(netflix).toHaveAttribute('href', '/recurring/edit?id=7');
    expect(netflix).toHaveTextContent('฿419');
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveTextContent('$4');
  });

  it('says so when the day has nothing', () => {
    renderCalendar(calendar({ dayEntries: [], dayTotal: 0, dayBills: [] }));
    expect(screen.getByText('Nothing on this day')).toBeInTheDocument();
  });
});
