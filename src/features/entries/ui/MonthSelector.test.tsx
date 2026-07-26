import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthSelector } from './MonthSelector';

describe('MonthSelector', () => {
  it('names the neighbouring months and uses the hrefs it is given', () => {
    render(<MonthSelector month={7} prevHref="?month=06" nextHref="?month=08" />);
    expect(screen.getByText('July')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous month: June' })).toHaveAttribute(
      'href',
      '?month=06',
    );
    expect(screen.getByRole('link', { name: 'Next month: August' })).toHaveAttribute(
      'href',
      '?month=08',
    );
  });

  // The labels come from stepMonth, the same wrap the page uses to build the hrefs — so a January
  // back-arrow announces December and goes there.
  it('names December as January’s previous month', () => {
    render(<MonthSelector month={1} prevHref="?month=12" nextHref="?month=02" />);
    expect(screen.getByRole('link', { name: 'Previous month: December' })).toBeInTheDocument();
  });

  it('names January as December’s next month', () => {
    render(<MonthSelector month={12} prevHref="?month=11" nextHref="?month=01" />);
    expect(screen.getByRole('link', { name: 'Next month: January' })).toBeInTheDocument();
  });

  // The calendar is a ring, not a range — there is no first or last month to disable at.
  it('never disables a direction', () => {
    render(<MonthSelector month={7} prevHref="?month=06" nextHref="?month=08" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
