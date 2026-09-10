import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('cycle=2026-08'),
}));

import { MoreSheet } from './MoreSheet';

// Rendered closed on purpose: the useEffect only calls close() on a closed <dialog>, so nothing
// touches showModal (which jsdom supports unevenly). The anchors are in the DOM either way, and
// querySelectorAll sees them regardless of the dialog's visibility.
function hrefs(): string[] {
  const { container } = render(<MoreSheet open={false} onClose={() => {}} />);
  return [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
}

describe('MoreSheet', () => {
  it('lists every destination once, in group order', () => {
    expect(hrefs()).toEqual([
      '/categories',
      '/accounts',
      '/currency',
      '/year',
      '/month',
      '/report',
      '/trips',
      '/budgets?cycle=2026-08',
      '/recurring',
      '/settings',
      '/checkup',
      '/about',
    ]);
  });

  it('captions each group', () => {
    const { container } = render(<MoreSheet open={false} onClose={() => {}} />);
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'Lists',
      'Review',
      'Plan',
      'App',
    ]);
  });

  // Budgets is the ONLY cycle-carrying destination. Regrouping moves tiles between array literals,
  // which is exactly the edit that can drop a per-tile flag without any test noticing.
  it('carries the selected cycle on Budgets alone', () => {
    const carrying = hrefs().filter((h) => h.includes('cycle='));
    expect(carrying).toEqual(['/budgets?cycle=2026-08']);
  });
});
