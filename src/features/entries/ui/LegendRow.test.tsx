import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LegendRow } from './LegendRow';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';
import type { DonutSlice } from '../donut';

// CategoryEditTrigger needs a picker provider ancestor (the app layout mounts one).
const withProvider = (ui: ReactElement) =>
  render(<CategoryPickerProvider iconSet="emoji">{ui}</CategoryPickerProvider>);

const slice = (over: Partial<DonutSlice> = {}): DonutSlice => ({
  name: 'Food',
  value: 2400,
  color: '#7c5cff',
  count: 12,
  ...over,
});

const row = (s: DonutSlice, total = 4000) =>
  withProvider(
    <ul>
      <LegendRow slice={s} total={total} cycleKey="2026-07" emojis={{}} hues={{}} iconSet="emoji" />
    </ul>,
  );

describe('LegendRow', () => {
  it('taps through to the category’s records for the cycle, encoding the name', () => {
    row(slice({ name: 'Transport & taxi' }));
    expect(screen.getByRole('link', { name: /Transport & taxi/i })).toHaveAttribute(
      'href',
      '/records?cycle=2026-07&category=Transport%20%26%20taxi',
    );
  });

  it('states the share of the cycle', () => {
    row(slice({ value: 1000 }), 4000);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  // An empty cycle would otherwise divide by zero and render "NaN%".
  it('shows 0% rather than NaN when nothing was spent', () => {
    row(slice({ value: 0 }), 0);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  // The row's text half is the primary drill-down on the primary screen, and it sits beside a 44px
  // button that opens a *different* thing. Anything under the 44px floor mis-fires under a thumb.
  it('gives the tap-through the 44px minimum height', () => {
    row(slice());
    expect(screen.getByRole('link', { name: /Food/i }).className).toContain('min-h-11');
  });

  describe('the synthetic Other bucket', () => {
    const other = slice({ name: 'Other', other: true });

    // No records carry the category "Other", so a link there would lead somewhere empty.
    it('is not a link', () => {
      row(other);
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    // Nor is it a real category, so there is no icon or hue to edit.
    it('offers no edit trigger', () => {
      row(other);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('still reserves the same row height so the list keeps its rhythm', () => {
      const { container } = row(other);
      expect(container.querySelector('.min-h-11')).not.toBeNull();
    });
  });
});
