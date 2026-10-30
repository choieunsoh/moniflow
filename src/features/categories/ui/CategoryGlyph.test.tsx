import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CategoryGlyph } from './CategoryGlyph';
import { CategoryIcon } from './CategoryIcon';

// '☕' is mapped in the lucide/phosphor sets (icon-map.lucide.ts). A synthetic bucket like the donut's
// "Other" has no emoji, so it exercises the unmapped fallback.
describe('CategoryGlyph', () => {
  it('renders the library icon (an <svg>) for a mapped emoji in a non-emoji set', () => {
    const { container } = render(<CategoryGlyph emoji="☕" iconSet="lucide" />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toBe(''); // no emoji glyph, just the icon
  });

  it('renders the emoji glyph in the emoji set', () => {
    const { container } = render(<CategoryGlyph emoji="☕" iconSet="emoji" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('☕');
  });

  it('treats an inherited key like constructor as unmapped, not as an icon component', () => {
    const { container } = render(<CategoryGlyph emoji="constructor" iconSet="lucide" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('constructor');
  });

  it('CategoryIcon also treats an inherited key as unmapped', () => {
    const { container } = render(
      <CategoryIcon emoji="constructor" name="Food" iconSet="phosphor" />,
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('constructor');
  });

  it('falls back to the emoji glyph when the set has no mapping for it', () => {
    const { container } = render(<CategoryGlyph emoji="🫥" iconSet="lucide" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('🫥');
  });
});
