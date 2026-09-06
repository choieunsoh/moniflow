import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayPaceCard } from './DayPaceCard';

describe('DayPaceCard', () => {
  it('states the three counts and the days they are out of', () => {
    render(<DayPaceCard pace={{ noSpend: 6, under: 15, over: 5, days: 26 }} />);
    const section = screen.getByRole('region', { name: /days against target/i });
    expect(section).toHaveTextContent('6No spend');
    expect(section).toHaveTextContent('15Under target');
    expect(section).toHaveTextContent('5Over target');
    expect(section).toHaveTextContent('26 days finished');
  });

  it('renders nothing without a target to grade against', () => {
    const { container } = render(<DayPaceCard pace={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('singularises a one-day cycle', () => {
    render(<DayPaceCard pace={{ noSpend: 1, under: 0, over: 0, days: 1 }} />);
    expect(screen.getByRole('region')).toHaveTextContent('1 day finished');
  });

  it('does not paint a zero in an alarm colour', () => {
    // "0 over target" is the best possible outcome for that tile; red would read as a warning.
    render(<DayPaceCard pace={{ noSpend: 3, under: 4, over: 0, days: 7 }} />);
    const zero = screen.getByText('0');
    expect(zero).toHaveStyle({ color: 'var(--color-muted)' });
  });
});
