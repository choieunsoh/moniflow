import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YearSelector } from './YearSelector';

describe('YearSelector', () => {
  it('links both ways in the middle of the range', () => {
    render(<YearSelector year={2025} firstYear={2023} currentYear={2026} />);
    expect(screen.getByRole('link', { name: /Previous year: 2024/ })).toHaveAttribute(
      'href',
      '?year=2024',
    );
    expect(screen.getByRole('link', { name: /Next year: 2026/ })).toHaveAttribute(
      'href',
      '?year=2026',
    );
  });

  // Boundaries stay in the accessibility tree as disabled buttons: a hidden control would leave a
  // screen-reader user unable to tell "edge of the data" from "this app only steps one way".
  it('closes the back arrow at the earliest year on record', () => {
    render(<YearSelector year={2023} firstYear={2023} currentYear={2026} />);
    expect(screen.queryByRole('link', { name: /Previous year/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Previous year — none/ })).toBeDisabled();
  });

  it('closes the forward arrow at the year in progress', () => {
    render(<YearSelector year={2026} firstYear={2023} currentYear={2026} />);
    expect(screen.queryByRole('link', { name: /Next year/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Next year — none yet/ })).toBeDisabled();
  });

  it('closes both arrows on an empty ledger', () => {
    render(<YearSelector year={2026} firstYear={null} currentYear={2026} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
