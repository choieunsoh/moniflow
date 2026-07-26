import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YearSelector } from './YearSelector';

// The bounds now live in the page (which feeds the same hrefs to SwipeNav, so gesture and arrows
// can't disagree). What this component still owns is how it renders an OPEN direction versus a
// CLOSED one — that is what these assert.
describe('YearSelector', () => {
  it('links both ways when both directions are open', () => {
    render(<YearSelector year={2025} prevHref="?year=2024" nextHref="?year=2026" />);
    expect(screen.getByRole('link', { name: /Previous year: 2024/ })).toHaveAttribute(
      'href',
      '?year=2024',
    );
    expect(screen.getByRole('link', { name: /Next year: 2026/ })).toHaveAttribute(
      'href',
      '?year=2026',
    );
  });

  // A closed direction stays in the accessibility tree as a disabled button: hidden, a screen-reader
  // user cannot tell "edge of the data" from "this app only steps one way".
  it('renders a closed back direction as a disabled button, not a missing one', () => {
    render(<YearSelector year={2023} prevHref={null} nextHref="?year=2024" />);
    expect(screen.queryByRole('link', { name: /Previous year/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Previous year — none/ })).toBeDisabled();
  });

  it('renders a closed forward direction as a disabled button', () => {
    render(<YearSelector year={2026} prevHref="?year=2025" nextHref={null} />);
    expect(screen.queryByRole('link', { name: /Next year/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Next year — none yet/ })).toBeDisabled();
  });

  it('closes both arrows when neither direction is reachable', () => {
    render(<YearSelector year={2026} prevHref={null} nextHref={null} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
