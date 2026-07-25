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
    expect(screen.getByText(/↑.*420/)).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText(/↓.*200/)).toBeInTheDocument();
  });

  it('renders no contributor list when none are given (backward compatible)', () => {
    render(<CycleDeltaCard delta={{ delta: 220, direction: 'up', prevTotal: 4000 }} />);
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
  });
});
