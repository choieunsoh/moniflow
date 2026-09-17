import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarGrid } from './CalendarGrid';
import type { DayMarks } from '../calendar-marks';

const cells = [
  { date: '2026-07-16', total: 0, intensity: 0 },
  { date: '2026-07-17', total: 240, intensity: 4 },
];
const NONE: DayMarks = { posted: false, upcoming: false, offBudget: false, refund: false };
const marks = new Map<string, DayMarks>([
  ['2026-07-17', { ...NONE, posted: true, offBudget: true }],
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
        marks={new Map([['2026-07-16', { ...NONE, posted: true }]])}
        hrefFor={(d) => d}
      />,
    );
    expect(screen.getByRole('link', { name: 'Thu 16 Jul: bill posted' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /no spending/ })).toBeNull();
  });

  it('names a refund in the label and lists it in the legend only when present', () => {
    render(
      <CalendarGrid
        cells={cells}
        marks={new Map([['2026-07-16', { ...NONE, refund: true }]])}
        hrefFor={(d) => d}
      />,
    );
    // A refund-only day nets to zero discretionary spend, so it names only its mark.
    expect(screen.getByRole('link', { name: 'Thu 16 Jul: refund' })).toBeInTheDocument();
    expect(screen.getByText('Refund')).toBeInTheDocument();
  });

  it('draws no Refund legend entry when no day has a refund', () => {
    render(<CalendarGrid cells={cells} marks={marks} hrefFor={(d) => d} />);
    expect(screen.queryByText('Refund')).toBeNull();
  });

  it("orders a busy day's marks posted, off-budget, refund in its label", () => {
    render(
      <CalendarGrid
        cells={cells}
        marks={new Map([['2026-07-17', { ...NONE, posted: true, offBudget: true, refund: true }]])}
        hrefFor={(d) => d}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Fri 17 Jul: ฿240, bill posted, off-budget, refund' }),
    ).toBeInTheDocument();
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
