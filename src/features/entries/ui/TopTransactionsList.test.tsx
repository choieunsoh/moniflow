import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopTransactionsList } from './TopTransactionsList';
import type { EntryRow } from '../schema';

// Minimal, valid EntryRow — only the fields the list actually reads vary between tests.
function makeEntry(overrides: Partial<EntryRow>): EntryRow {
  return {
    id: 1,
    date: '2026-07-10',
    time: null,
    accountId: 1,
    categoryId: 1,
    amount: -2000,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget: null,
    category: 'Food',
    account: 'Cash',
    ...overrides,
  };
}

describe('TopTransactionsList refund rendering', () => {
  // Driving case: topTransactions ranks by magnitude with no sign filter, so a big refund (dinner
  // ฿2,000 on a card, a friend hands back ฿500 cash) can land in this "biggest purchases" list too.
  // Before the fix it printed formatBaht(Math.abs(amount)) — a bare ฿500 in default ink,
  // indistinguishable from a ฿500 purchase, both on screen and to a screen reader.
  it('marks a refund with a leading + and gain colour, not a bare magnitude', () => {
    const refund = makeEntry({ id: 2, amount: 500, category: 'Food', note: 'Dinner refund' });
    render(
      <TopTransactionsList
        entries={[refund]}
        emojiMap={{}}
        hueMap={{}}
        iconSet="emoji"
        cycleKey="2026-07"
      />,
    );

    const link = screen.getByRole('link', { name: /Dinner refund/i });
    expect(link).toHaveAttribute('aria-label', 'Dinner refund (Food) +฿500.00 on Fri 10 Jul');

    expect(screen.getByText('+฿500.00')).toBeInTheDocument();
    const amountSpan = screen.getByText('+฿500.00');
    expect(amountSpan.getAttribute('style')).toContain('var(--color-gain)');
  });

  it('still states a real purchase as a plain magnitude, not signed', () => {
    const expense = makeEntry({ id: 3, amount: -2000, category: 'Food', note: 'Dinner' });
    render(
      <TopTransactionsList
        entries={[expense]}
        emojiMap={{}}
        hueMap={{}}
        iconSet="emoji"
        cycleKey="2026-07"
      />,
    );

    expect(screen.getByText('฿2,000.00')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Dinner/i });
    expect(link).toHaveAttribute('aria-label', expect.stringContaining('฿2,000.00 on'));
  });
});
