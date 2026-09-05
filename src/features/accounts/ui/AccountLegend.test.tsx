import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { toBars } from '@features/entries/breakdown';
import { MAX_SLICES } from '@features/entries/donut';
import type { Breakdown } from '@features/entries/queries';
import { AccountLegend } from './AccountLegend';

// Spend is negative; -1000, -900, -800 … so the ranking is the array order.
function spending(n: number): Breakdown[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `Account ${i + 1}`,
    total: -(1000 - i * 10),
    count: 1,
  }));
}

function renderLegend(rows: Breakdown[]) {
  return render(<AccountLegend bars={toBars(rows)} />);
}

describe('AccountLegend', () => {
  // THE invariant, stated in entries/donut.ts beside MAX_SLICES: the ring and the ranked list beside
  // it are "one dataset rendered twice", so they must fold at the SAME point. The ring has no choice
  // but to roll its tail into "Other". This list was rendering every account, so a cycle touching 20
  // accounts put 7 names + Other in the ring above 20 names in the list.
  it('leads with exactly as many accounts as the ring names', () => {
    const { container } = renderLegend(spending(MAX_SLICES + 5));

    const lead = container.querySelector('ul');
    expect(lead).not.toBeNull();
    if (lead === null) throw new Error('unreachable — checked above');
    expect(within(lead).getAllByRole('listitem')).toHaveLength(MAX_SLICES);
  });

  it('folds the rest behind one disclosure, named for accounts and not categories', () => {
    renderLegend(spending(MAX_SLICES + 5));
    expect(screen.getByText('5 more accounts')).toBeDefined();
  });

  // A cap would drop them; a disclosure must not. Every account is still in the document, which is
  // what lets the page carry a total without it summing rows the reader cannot reach.
  it('keeps every account in the document, tail included', () => {
    renderLegend(spending(MAX_SLICES + 5));
    expect(screen.getByText(`Account ${MAX_SLICES + 5}`)).toBeDefined();
  });

  it('offers no disclosure when nothing is folded', () => {
    const { container } = renderLegend(spending(MAX_SLICES));
    expect(container.querySelector('details')).toBeNull();
  });

  // An account whose refunds exceed its spend has nothing to show, and toDonutSlices drops it from
  // the ring — so the list must fold at the same point or the two disagree about which accounts had
  // spending at all. This was already true before the fold and must stay true after it.
  it('drops a net-refunded account, the same way the ring does', () => {
    renderLegend([
      { key: 'Spent', total: -500, count: 2 },
      { key: 'Net refunded', total: 300, count: 1 },
    ]);
    expect(screen.getByText('Spent')).toBeDefined();
    expect(screen.queryByText('Net refunded')).toBeNull();
  });

  it('states each account magnitude as a positive baht figure', () => {
    renderLegend([{ key: 'Cash', total: -1234.56, count: 3 }]);
    expect(screen.getByText('฿1,234.56')).toBeDefined();
  });
});
