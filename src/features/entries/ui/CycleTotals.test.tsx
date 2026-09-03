import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycleTotals } from './CycleTotals';

// The real ledger's shape for cycle 18 Aug to 17 Sep 2026: 11,226 gross, all of it fixed cost,
// one 888 refund, so discretionary is -888. The old card printed "Spent this cycle -฿888 of
// ฿38,375", which was two frames on one line.
const refundCycle = {
  grossSpend: 11226,
  refunded: 888,
  refundedCategories: ['เกมส์'],
  net: 10338,
  offBudgetTotal: 0,
  fixedPosted: 11226,
  discretionarySpend: -888,
  totalStatus: { limit: 38375, spent: -888, pct: 0, remaining: 39263, state: 'under' as const },
  pacePct: 55,
  showPace: true,
};

describe('CycleTotals', () => {
  it('leads with gross spend and never prints "spent" before a minus sign', () => {
    render(<CycleTotals {...refundCycle} />);
    expect(screen.getByText('Spent this cycle').closest('div')).toHaveTextContent('฿11,226');
    expect(screen.queryByText(/-฿888/)).not.toBeInTheDocument();
  });

  it('names the refund and the net beneath the gross figure', () => {
    render(<CycleTotals {...refundCycle} />);
    expect(screen.getByText(/฿888 refunded in เกมส์ · net ฿10,338/)).toBeInTheDocument();
  });

  it('joins more than one refunded category', () => {
    render(
      <CycleTotals
        {...refundCycle}
        refunded={1388}
        refundedCategories={['เกมส์', 'อาหาร']}
        net={9838}
      />,
    );
    expect(screen.getByText(/฿1,388 refunded in เกมส์, อาหาร · net ฿9,838/)).toBeInTheDocument();
  });

  it('keeps the only denominator on the budget block', () => {
    render(<CycleTotals {...refundCycle} />);
    const budget = screen.getByText('Spent from budget').closest('div');
    expect(budget).toHaveTextContent('฿38,375');
    // Gross must never be measured against the ceiling: the ceiling is 50,000 budget minus
    // 11,625 fixed, and this gross IS that fixed cost, so it would read as 29% used when the
    // true discretionary figure is zero.
    expect(budget).not.toHaveTextContent('฿11,226');
  });

  it('omits the refund line on a cycle with no refunds', () => {
    render(<CycleTotals {...refundCycle} refunded={0} net={11226} />);
    expect(screen.queryByText(/refunded/)).not.toBeInTheDocument();
  });

  it('renders no budget block when no budget is set', () => {
    render(<CycleTotals {...refundCycle} totalStatus={null} />);
    expect(screen.queryByText('Spent from budget')).not.toBeInTheDocument();
    expect(screen.getByText('Spent this cycle')).toBeInTheDocument();
  });
});
