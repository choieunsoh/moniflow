import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Breakdown } from './Breakdown';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';
import type { Breakdown as BreakdownRow } from '../queries';

// CategoryIconButton (rendered when `emojis` is passed) needs a picker provider ancestor.
const withProvider = (ui: ReactElement) =>
  render(<CategoryPickerProvider iconSet="emoji">{ui}</CategoryPickerProvider>);

const rows: BreakdownRow[] = [
  { key: 'Food', total: -2400, count: 12 },
  { key: 'Transport & taxi', total: -600, count: 3 },
];

describe('Breakdown category links', () => {
  // The home dashboard passes `cycleKey`, opting each category row into a tap-through to its
  // filtered records for the cycle on screen.
  it('links each category row to its filtered records when cycleKey is set', () => {
    withProvider(<Breakdown title="Spending" rows={rows} emojis={{}} cycleKey="2026-07" />);

    const food = screen.getByRole('link', { name: /Food/i });
    expect(food).toHaveAttribute('href', '/records?cycle=2026-07&category=Food');

    // Category names with URL-significant characters must be encoded.
    const taxi = screen.getByRole('link', { name: /Transport & taxi/i });
    expect(taxi).toHaveAttribute('href', '/records?cycle=2026-07&category=Transport%20%26%20taxi');
  });

  // Reused for account breakdowns (no cycleKey, no emojis) — those rows must not become links.
  it('renders no links when cycleKey is absent', () => {
    render(<Breakdown title="By account" rows={rows} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
