import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Breakdown } from './Breakdown';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';
import type { Breakdown as BreakdownRow } from '../queries';

// CategoryIconButton (rendered when `emojis` is passed) needs a picker provider ancestor.
const withProvider = (ui: ReactElement) =>
  render(<CategoryPickerProvider iconSet="emoji">{ui}</CategoryPickerProvider>);

const rows: BreakdownRow[] = [
  { key: 'Food', total: -2400, count: 12 },
  { key: 'Transport & taxi', total: -600, count: 3 },
];

describe('Breakdown category links', () => {
  // The home dashboard passes `cycleKey`, opting each category row into a tap-through to its
  // filtered records for the cycle on screen.
  it('links each category row to its filtered records when cycleKey is set', () => {
    withProvider(<Breakdown title="Spending" rows={rows} emojis={{}} cycleKey="2026-07" />);

    const food = screen.getByRole('link', { name: /Food/i });
    expect(food).toHaveAttribute('href', '/records?cycle=2026-07&category=Food');

    // Category names with URL-significant characters must be encoded.
    const taxi = screen.getByRole('link', { name: /Transport & taxi/i });
    expect(taxi).toHaveAttribute('href', '/records?cycle=2026-07&category=Transport%20%26%20taxi');
  });

  // Reused for account breakdowns (no cycleKey, no emojis) — those rows must not become links.
  it('renders no links when cycleKey is absent', () => {
    render(<Breakdown title="By account" rows={rows} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  // Sits beside a 44px icon button that opens the category picker, so a short row means a thumb
  // aiming at the category name opens the wrong thing.
  it('gives each tap-through the 44px minimum height', () => {
    withProvider(<Breakdown title="Spending" rows={rows} emojis={{}} cycleKey="2026-07" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('min-h-11');
    }
  });
});

describe('Breakdown net-positive categories', () => {
  // Driving case: dinner on a credit card, a friend hands back cash — the refund is filed under the
  // SAME category, so a category whose refunds this cycle exceed its spend nets positive. The donut
  // already drops such categories (`toDonutSlices`'s own `value > 0` filter); the list must fold at
  // the same point or the chart/list toggle would change the answer.
  const rowsWithRefund: BreakdownRow[] = [
    { key: 'Food', total: -2400, count: 12 },
    { key: 'Transport & taxi', total: -600, count: 3 },
    { key: 'Refunded gift', total: 500, count: 1 },
  ];

  it('drops a net-positive category from the list, keeping the net-negative ones', () => {
    render(<Breakdown title="Spending" rows={rowsWithRefund} />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Transport & taxi')).toBeInTheDocument();
    expect(screen.queryByText('Refunded gift')).not.toBeInTheDocument();
  });

  // The escalated half of the bug: an unclamped `spent` fed a net-positive total straight into
  // `toBudgetTotal`, so a category with no real spend this cycle — only a refund — could still read
  // as over-budget. A limit smaller than the refund total would classify it "over" under the old
  // `Math.abs` read; the row must never reach the DOM at all under the fix.
  it('never drives a budget meter for a net-positive category, even under a limit that would read it as over', () => {
    const refundOnly: BreakdownRow[] = [{ key: 'Refunded gift', total: 500, count: 1 }];
    render(
      <Breakdown title="Spending" rows={refundOnly} limits={new Map([['Refunded gift', 100]])} />,
    );
    expect(screen.queryByText('Refunded gift')).not.toBeInTheDocument();
    // meterCaption's "over" state renders `over ${amount}` — assert that text never reaches the DOM.
    expect(screen.queryByText(/over/i)).not.toBeInTheDocument();
  });
});

describe('Breakdown bar colour', () => {
  // Home passes the donut's slice colours so a category reads the same in both views. Anything
  // without a mapped colour goes NEUTRAL, never the accent: filling unmapped rows with #7132f5 put
  // them a hair from Rent's identity #7c5cff, so two near-identical purples meant "this category"
  // and "no colour assigned".
  it('fills each bar with the category colour when one is given', () => {
    const { container } = withProvider(
      <Breakdown
        title="Spending"
        rows={rows}
        emojis={{}}
        colors={new Map([['Food', '#7c5cff']])}
      />,
    );
    const bars = container.querySelectorAll('div[style*="width"]');
    expect(bars[0].getAttribute('style')).toContain('rgb(124, 92, 255)'); // #7c5cff, normalised
    // Transport & taxi has no mapped colour — neutral, so it can't be mistaken for an identity.
    expect(bars[1].getAttribute('style')).toContain('var(--color-border-strong)');
  });

  it('stays neutral when no colours are given', () => {
    const { container } = render(<Breakdown title="By account" rows={rows} />);
    for (const bar of container.querySelectorAll('div[style*="width"]')) {
      expect(bar.getAttribute('style')).toContain('var(--color-border-strong)');
    }
  });
});
