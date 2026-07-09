import { describe, expect, it } from 'vitest';
import { isActivePath } from './active-path';

describe('isActivePath', () => {
  it('matches home only on exact "/"', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/budgets', '/')).toBe(false);
  });

  it('matches non-home routes by prefix', () => {
    expect(isActivePath('/budgets', '/budgets')).toBe(true);
    expect(isActivePath('/trips/2', '/trips')).toBe(true);
    expect(isActivePath('/settings', '/budgets')).toBe(false);
  });
});
