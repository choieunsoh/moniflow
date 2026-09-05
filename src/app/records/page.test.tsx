import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { EntryRow } from '@features/entries/schema';
import type { RecordsData } from '@features/entries/use-records';

// The page reads its params from useSearchParams and its data from useRecords. Both are mocked here
// because neither is what this file is testing: the defect this covers lived entirely in the page's
// choice of money formatter for a figure the hook had already computed correctly.
//
// The useRecords mock is typed as RecordsData, so a shape change breaks `npm run typecheck` rather
// than silently drifting the way an untyped module mock would.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  // SwipeRow navigates on tap; the page never calls it, but the row mounts the hook.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
vi.mock('@features/entries/use-records', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/entries/use-records')>()),
  useRecords: vi.fn(),
}));

import { useRecords } from '@features/entries/use-records';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';
import RecordsPage from './page';

function entry(id: number, date: string, amount: number, note: string): EntryRow {
  return {
    id,
    date,
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency: 'THB',
    originalAmount: null,
    note,
    source: 'manual',
    offBudget: null,
    category: 'Food',
    account: 'Cash',
  };
}

// One net-NEGATIVE day (an ordinary spend) and one net-POSITIVE day (a lone refund), so a single
// render exercises both sides of formatLedgerSpend's branch.
const SPEND = entry(1, '2026-07-02', -1200, 'Lunch');
const REFUND = entry(2, '2026-07-01', 2000, 'Dinner split repaid');

function data(): RecordsData {
  return {
    cutoff: 25,
    activeKey: '2026-07',
    canGoNext: false,
    emojiMap: {},
    hueMap: {},
    accountIconMap: {},
    accountHueMap: {},
    iconSet: 'emoji',
    query: '',
    searching: false,
    tripMode: false,
    filtered: false,
    allCategory: false,
    spanAll: false,
    groupBy: 'date',
    entries: [SPEND, REFUND],
    sections: [
      { key: SPEND.date, entries: [SPEND], total: SPEND.amount, foreign: [] },
      { key: REFUND.date, entries: [REFUND], total: REFUND.amount, foreign: [] },
    ],
    total: SPEND.amount + REFUND.amount,
    currencySums: [],
    page: 1,
    pageCount: 1,
  };
}

function renderPage(): void {
  render(
    <CategoryPickerProvider iconSet="emoji">
      <RecordsPage />
    </CategoryPickerProvider>,
  );
}

beforeEach(() => {
  vi.mocked(useRecords).mockReturnValue({ ready: true, data: data() });
});

describe('/records money frames', () => {
  // THE regression. A section header is a plain sum of the rows beneath it, so the two are figures
  // in the same frame and must render identically. The page used to negate the total first
  // (`total > 0 ? formatSignedBaht(-total) : formatBaht(-total)`), which printed −฿405.00 on the
  // header directly above the +฿405.00 row it summed — the same money, opposite signs, thirty
  // pixels apart. Nothing rendered that pairing until this test.
  it('prints a lone refund the same way on its day header as on the row it sums', () => {
    renderPage();

    const refundSection = screen.getByText('Dinner split repaid').closest('details');
    expect(refundSection).not.toBeNull();
    if (refundSection === null) throw new Error('unreachable — checked above');

    const header = refundSection.querySelector('summary');
    expect(header).not.toBeNull();
    if (header === null) throw new Error('unreachable — checked above');

    expect(header.textContent).toContain('+฿2,000.00');
    expect(header.textContent).not.toContain('−฿2,000.00');
    // The header and the single row beneath it are the same money, so the section renders that
    // exact string TWICE. That pairing is the whole regression: before the fix the section held
    // one −฿2,000.00 and one +฿2,000.00.
    expect(within(refundSection).getAllByText('+฿2,000.00')).toHaveLength(2);
  });

  // Deliberately NOT a regression test for the defect above: on a negative section both the old
  // and the new expression render '฿1,200.00', so this one cannot tell them apart. It guards the
  // opposite over-correction — signing every row once refunds exist.
  it('leaves an ordinary spend header plain and unsigned', () => {
    renderPage();

    const spendSection = screen.getByText('Lunch').closest('details');
    if (spendSection === null) throw new Error('missing the spend section');
    const header = spendSection.querySelector('summary');
    if (header === null) throw new Error('missing the spend header');

    expect(header.textContent).toContain('฿1,200.00');
    expect(header.textContent).not.toContain('−฿1,200.00');
    expect(header.textContent).not.toContain('+฿1,200.00');
  });

  // The results line above every section sums them all, so it is in the same frame again. These
  // sections net POSITIVE (a refund bigger than the spend beside it — what a filtered or searched
  // refund view looks like, which is how the defect was found), so the old expression would print
  // −฿800.00 here while the section headers below it read +฿2,000.00 and ฿1,200.00.
  it('prints a net-positive results total signed the way its sections are', () => {
    renderPage();
    expect(screen.getByText('+฿800.00')).toBeDefined();
    expect(screen.queryByText('−฿800.00')).toBeNull();
  });
});
