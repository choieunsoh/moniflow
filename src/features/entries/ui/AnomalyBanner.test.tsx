import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnomalyBanner } from './AnomalyBanner';

describe('AnomalyBanner', () => {
  it('renders nothing when there are no anomalies', () => {
    const { container } = render(<AnomalyBanner anomalies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the worst offenders with their ratio', () => {
    render(
      <AnomalyBanner
        anomalies={[
          { category: 'Food', current: 2500, avg: 1000, ratio: 2.5 },
          { category: 'Fun', current: 900, avg: 500, ratio: 1.8 },
        ]}
      />,
    );
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText(/2\.5×/)).toBeInTheDocument();
  });
});
