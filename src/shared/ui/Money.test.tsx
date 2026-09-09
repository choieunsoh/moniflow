import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Money } from './Money';

describe('Money', () => {
  it('renders its children inside a .money span', () => {
    render(<Money>฿228.00</Money>);
    const el = screen.getByText('฿228.00');
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('money')).toBe(true);
  });
});
