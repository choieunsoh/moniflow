import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarGrid } from './CalendarGrid';
import type { DayMarks } from '../calendar-marks';

const cells = [
  { date: '2026-07-16', total: 0, intensity: 0 },
  { date: '2026-07-17', total: 240, intensity: 4 },
];
const marks = new Map<string, DayMarks>([
  ['2026-07-17', { posted: true, upcoming: false, offBudget: true }],
]);

describe('CalendarGrid', () => {
  it('renders plain cells when there is no hrefFor (Trends)', () => {
    render(<CalendarGrid cells={cells} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByLabelText('Fri 17 Jul: ฿240')).toHaveTextContent('17');
    // An empty day stays out of the accessibility tree, as before.
    expect(screen.queryByLabelText(/16 Jul/)).toBeNull();
  });

  it('links every day, names its marks in words, and flags the selected day', () => {
    render(
      <CalendarGrid
        cells={cells}
        marks={marks}
        selectedDay="2026-07-17"
        hrefFor={(d) => `/records?day=${d}`}
      />,
    );
    const busy = screen.getByRole('link', { name: 'Fri 17 Jul: ฿240, bill posted, off-budget' });
    expect(busy).toHaveAttribute('href', '/records?day=2026-07-17');
    expect(busy).toHaveAttribute('aria-current', 'date');
    const empty = screen.getByRole('link', { name: 'Thu 16 Jul: no spending' });
    expect(empty).not.toHaveAttribute('aria-current');
  });

  // A bill-only day has no discretionary spend, but "no spending, bill posted" reads as a
  // contradiction — money did move. Such a day names only its marks.
  it('names only the marks on a zero-discretionary day that has them', () => {
    render(
      <CalendarGrid
        cells={cells}
        marks={new Map([['2026-07-16', { posted: true, upcoming: false, offBudget: false }]])}
        hrefFor={(d) => d}
      />,
    );
    expect(screen.getByRole('link', { name: 'Thu 16 Jul: bill posted' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /no spending/ })).toBeNull();
  });

  it('lists only the mark kinds that appear in the legend', () => {
    render(<CalendarGrid cells={cells} marks={marks} hrefFor={(d) => d} />);
    expect(screen.getByText('Bill posted')).toBeInTheDocument();
    expect(screen.getByText('Off-budget')).toBeInTheDocument();
    expect(screen.queryByText('Bill due')).toBeNull();
  });

  it('draws no legend without marks', () => {
    render(<CalendarGrid cells={cells} />);
    expect(screen.queryByText('Bill posted')).toBeNull();
  });
});
