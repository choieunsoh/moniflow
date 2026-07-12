import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AccountGlyph } from './AccountGlyph';
import { ACCOUNT_ICONS } from '../queries';

describe('AccountGlyph', () => {
  it('renders an <svg> for every icon key in the set', () => {
    for (const key of ACCOUNT_ICONS) {
      const { container } = render(<AccountGlyph icon={key} size={24} />);
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('falls back to the card glyph for an unknown key', () => {
    const unknown = render(<AccountGlyph icon="not-a-real-key" size={24} />);
    const card = render(<AccountGlyph icon="card" size={24} />);
    expect(unknown.container.innerHTML).toBe(card.container.innerHTML);
  });

  it('applies the requested size to the svg', () => {
    const { container } = render(<AccountGlyph icon="visa" size={40} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('40');
    expect(svg?.getAttribute('height')).toBe('40');
  });
});
