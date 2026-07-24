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
    expect(screen.getByLabelText(/2 Jul/)).toBeInTheDocument();
    // an empty day carries no accessible label (aria-hidden)
    expect(screen.queryByLabelText(/1 Jul/)).toBeNull();
  });
});
