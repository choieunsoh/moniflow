import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AccountIcon } from './AccountIcon';

describe('AccountIcon', () => {
  it('renders the glyph white on a bold hue disc (categoryColorBold, like CategoryIcon)', () => {
    const { container } = render(<AccountIcon icon="visa" name="Visa" size="md" />);
    const disc = container.firstElementChild;
    expect(disc).not.toBeNull();
    expect(disc?.querySelector('svg')).not.toBeNull();
    const style = disc instanceof HTMLElement ? disc.style : null;
    // Bold solid disc from categoryColorBold, NOT the old soft color-mix tint. (jsdom computes the
    // hsl() to rgb(), unlike color-mix which it kept verbatim.)
    expect(style?.background).toMatch(/^rgb\(/);
    expect(style?.background).not.toContain('color-mix');
    // The monochrome glyph inherits white via currentColor.
    expect(style?.color).toBe('rgb(255, 255, 255)');
  });

  it('a picked hue drives the disc color', () => {
    const { container } = render(<AccountIcon icon="cash" name="Cash" size="md" hue={0} />);
    const disc = container.firstElementChild;
    // hue 0 (red) → categoryColorBold(_, 0) === hsl(0 55% 46%), which jsdom computes to rgb(182,53,53).
    expect(disc instanceof HTMLElement ? disc.style.background : '').toBe('rgb(182, 53, 53)');
  });
});
