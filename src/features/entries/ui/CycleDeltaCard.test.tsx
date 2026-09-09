import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycleDeltaCard } from './CycleDeltaCard';

describe('CycleDeltaCard contributors', () => {
  it('lists the top movers under the total with direction arrows', () => {
    render(
      <CycleDeltaCard
        delta={{ delta: 220, direction: 'up', prevTotal: 4000 }}
        contributors={[
          { category: 'Food', delta: 420 },
          { category: 'Transport', delta: -200 },
        ]}
        emojiMap={{}}
        hueMap={{}}
        iconSet="emoji"
      />,
    );
    expect(screen.getByText('Food')).toBeInTheDocument();
    // The figure is now nested inside <Money>, so the arrow-plus-figure text is split across two
    // elements — getByText only reads an element's own direct text nodes. toHaveTextContent reads
    // the whole subtree, which is what this assertion actually means to check.
    expect(screen.getByText('฿420').parentElement).toHaveTextContent(/↑.*420/);
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('฿200').parentElement).toHaveTextContent(/↓.*200/);
  });

  it('renders no contributor list when none are given (backward compatible)', () => {
    render(<CycleDeltaCard delta={{ delta: 220, direction: 'up', prevTotal: 4000 }} />);
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
  });
});
