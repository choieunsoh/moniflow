import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekdayCard } from './WeekdayCard';
import type { WeekdayStats } from '../by-weekday';

const stats = (over: Partial<WeekdayStats> = {}): WeekdayStats => ({
  rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
    day,
    total: 0,
    count: 0,
  })),
  peak: null,
  weekendRatio: null,
  totalCount: 0,
  ...over,
});

describe('WeekdayCard', () => {
  it('renders nothing when there is no spend', () => {
    const { container } = render(<WeekdayCard stats={stats()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the peak day when there is enough data', () => {
    render(
      <WeekdayCard
        stats={stats({
          rows: [
            { day: 'Mon', total: 100, count: 1 },
            { day: 'Tue', total: 0, count: 0 },
            { day: 'Wed', total: 0, count: 0 },
            { day: 'Thu', total: 0, count: 0 },
            { day: 'Fri', total: 500, count: 3 },
            { day: 'Sat', total: 200, count: 2 },
            { day: 'Sun', total: 0, count: 0 },
          ],
          peak: { day: 'Fri', total: 500, count: 3 },
          weekendRatio: 1.8,
          totalCount: 6,
        })}
      />,
    );
    // `/Fri/` alone matches both the day-row label and the takeaway sentence — scope to the
    // takeaway so the query is unambiguous while still asserting the peak day gets named.
    expect(screen.getByText(/Fri is your peak/)).toBeInTheDocument();
  });

  it('softens the copy on a thin sample instead of asserting a pattern', () => {
    render(
      <WeekdayCard stats={stats({ peak: { day: 'Mon', total: 50, count: 1 }, totalCount: 1 })} />,
    );
    expect(screen.getByText(/not enough/i)).toBeInTheDocument();
  });
});
