import { describe, it, expect } from 'vitest';
import { cycleHref } from './cycle-href';

describe('cycleHref', () => {
  it('appends the active cycle so it carries across tabs', () => {
    expect(cycleHref('/records', '2026-03')).toBe('/records?cycle=2026-03');
    expect(cycleHref('/', '2026-03')).toBe('/?cycle=2026-03');
  });

  it('leaves the path bare when no cycle is selected (fresh load → current cycle)', () => {
    expect(cycleHref('/budgets', null)).toBe('/budgets');
  });
});
