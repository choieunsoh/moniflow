import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SafeToSpendCard } from './ForwardCards';
import type { HomeForward } from '../use-home';

const noBills: HomeForward['upcoming'] = { total: 0, count: 0, byCurrency: [] };

describe('SafeToSpendCard', () => {
  it('shows what the per-day figure becomes tomorrow with one fewer day to spread over', () => {
    // ฿999/day over 10 days → the same ฿9,990 over 9 days is ฿1,110.
    render(<SafeToSpendCard safePerDay={999} avgPerDay={0} daysLeft={10} upcoming={noBills} />);
    expect(screen.getByText(/฿1,110/)).toBeInTheDocument();
    expect(screen.getByText(/tomorrow/)).toBeInTheDocument();
  });

  it('omits tomorrow on the last day of the cycle', () => {
    render(<SafeToSpendCard safePerDay={999} avgPerDay={0} daysLeft={1} upcoming={noBills} />);
    expect(screen.queryByText(/tomorrow/)).toBeNull();
  });
});
