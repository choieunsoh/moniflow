import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AccountIcon } from './AccountIcon';

describe('AccountIcon', () => {
  it('renders the glyph inside a colored disc', () => {
    const { container } = render(<AccountIcon icon="visa" name="Visa" size="md" />);
    const disc = container.firstElementChild;
    expect(disc).not.toBeNull();
    expect(disc?.querySelector('svg')).not.toBeNull();
    // hue disc uses an hsl(...) background from color.ts (name-derived when no hue given)
    expect(disc instanceof HTMLElement ? disc.style.background : '').toContain('color-mix');
  });
});
