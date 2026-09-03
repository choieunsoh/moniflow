import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RingFootnote } from './RingFootnote';

describe('RingFootnote', () => {
  it('names the refunded amount and its category', () => {
    render(<RingFootnote refunded={888} categories={['เกมส์']} />);
    expect(screen.getByText(/฿888/)).toBeInTheDocument();
    expect(screen.getByText(/เกมส์/)).toBeInTheDocument();
    expect(screen.getByText(/not shown in the ring/)).toBeInTheDocument();
  });

  it('lists every refunded category', () => {
    render(<RingFootnote refunded={900} categories={['เกมส์', 'Grab Food']} />);
    expect(screen.getByText(/เกมส์, Grab Food/)).toBeInTheDocument();
  });

  it('renders nothing when there is no refund, so an ordinary cycle gains no chrome', () => {
    const { container } = render(<RingFootnote refunded={0} categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a negative difference rather than printing a negative refund', () => {
    const { container } = render(<RingFootnote refunded={-5} categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
