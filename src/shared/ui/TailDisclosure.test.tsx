import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TailDisclosure } from './TailDisclosure';

describe('TailDisclosure', () => {
  it('names how many rows it holds, and what they are', () => {
    render(
      <TailDisclosure count={12} singular="account" plural="accounts">
        <p>tail</p>
      </TailDisclosure>,
    );
    expect(screen.getByText('12 more accounts')).toBeDefined();
  });

  // The markup this replaces hardcoded "category"/"categories", so an account list reusing it would
  // have offered "12 more categories". The noun is a prop for exactly that reason.
  it('takes an irregular plural rather than assuming an -s', () => {
    render(
      <TailDisclosure count={3} singular="category" plural="categories">
        <p>tail</p>
      </TailDisclosure>,
    );
    expect(screen.getByText('3 more categories')).toBeDefined();
  });

  it('says one more <singular> for a tail of exactly one', () => {
    render(
      <TailDisclosure count={1} singular="category" plural="categories">
        <p>tail</p>
      </TailDisclosure>,
    );
    expect(screen.getByText('1 more category')).toBeDefined();
  });

  // A disclosure that starts open is not a disclosure — the whole point is that the page does not
  // end on the long quiet tail of the ranking.
  it('starts closed, with the tail still in the document', () => {
    const { container } = render(
      <TailDisclosure count={2} singular="account" plural="accounts">
        <p>tail row</p>
      </TailDisclosure>,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    // Present, not removed: the rows stay reachable (and findable by search) rather than dropped.
    expect(screen.getByText('tail row')).toBeDefined();
  });

  // Nothing to disclose must render nothing at all, so a short list does not end on a dead control.
  it('renders nothing when the tail is empty', () => {
    const { container } = render(
      <TailDisclosure count={0} singular="account" plural="accounts">
        <p>tail</p>
      </TailDisclosure>,
    );
    expect(container.querySelector('details')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
