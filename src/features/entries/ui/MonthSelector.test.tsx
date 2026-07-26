import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthSelector } from './MonthSelector';

const href = (m: number) => `?month=${String(m).padStart(2, '0')}`;

describe('MonthSelector', () => {
  it('steps to the neighbouring months', () => {
    render(<MonthSelector month={7} hrefFor={href} />);
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

  // The calendar is a ring, not a range — there is no first or last month to disable at.
  it('wraps backwards from January to December', () => {
    render(<MonthSelector month={1} hrefFor={href} />);
    expect(screen.getByRole('link', { name: 'Previous month: December' })).toHaveAttribute(
      'href',
      '?month=12',
    );
  });

  it('wraps forwards from December to January', () => {
    render(<MonthSelector month={12} hrefFor={href} />);
    expect(screen.getByRole('link', { name: 'Next month: January' })).toHaveAttribute(
      'href',
      '?month=01',
    );
  });

  it('never disables a direction', () => {
    render(<MonthSelector month={7} hrefFor={href} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
