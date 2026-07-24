import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpendHeatmap } from './SpendHeatmap';

describe('SpendHeatmap', () => {
  it('renders one cell per day and labels populated days with their total', () => {
    render(
      <SpendHeatmap
        cells={[
          { date: '2026-07-01', total: 0, intensity: 0 },
          { date: '2026-07-02', total: 100, intensity: 4 },
        ]}
      />,
    );
    // the populated day exposes an accessible label with its date + amount
    // (formatDayHeading is day-before-month, e.g. "Thu 2 Jul" — matches DashboardCards.tsx's
    // existing convention in @shared/date)
    const populated = screen.getByLabelText(/2 Jul/);
    expect(populated).toBeInTheDocument();
    // and shows its day-of-month number, calendar-style
    expect(populated).toHaveTextContent('2');
    // an empty day carries no accessible label (aria-hidden)
    expect(screen.queryByLabelText(/1 Jul/)).toBeNull();
  });

  it('lays days out under weekday columns with a Sunday-started header row', () => {
    render(<SpendHeatmap cells={[{ date: '2026-07-19', total: 50, intensity: 3 }]} />);
    // narrow weekday header: S M T W T F S — Sunday and Saturday both render "S"
    expect(screen.getAllByText('S')).toHaveLength(2);
    // 2026-07-19 is a Sunday, so it sits in the first column with no leading gap before it
    expect(screen.getByLabelText(/19 Jul/)).toHaveTextContent('19');
  });
});
