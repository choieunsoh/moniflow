import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopNotesList } from './TopNotesList';

describe('TopNotesList', () => {
  it('renders nothing when there are no notes', () => {
    const { container } = render(<TopNotesList notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists notes with their totals and counts', () => {
    render(
      <TopNotesList
        notes={[
          { note: 'Starbucks', total: 200, count: 2 },
          { note: '7-11', total: 60, count: 1 },
        ]}
      />,
    );
    expect(screen.getByText('Starbucks')).toBeInTheDocument();
    expect(screen.getByText(/\(2\)/)).toBeInTheDocument();
  });
});

describe('the no-note residual', () => {
  const rows = [
    { note: 'No note', total: 9000, count: 3 },
    { note: 'Netflix', total: 200, count: 1 },
  ];

  it('renders as a residual, not as a merchant name', () => {
    render(<TopNotesList notes={rows} />);
    expect(screen.getByText('(no note)')).toBeInTheDocument();
    expect(screen.queryByText('No note')).not.toBeInTheDocument();
  });

  it('sorts last even when its total is the largest', () => {
    render(<TopNotesList notes={rows} />);
    const items = screen.getAllByRole('listitem');
    expect(items[items.length - 1]).toHaveTextContent('(no note)');
  });

  it('stays inside the row cap rather than being pushed out of view', () => {
    // Selection by value happens first, so a large residual still makes the cut and only its
    // POSITION changes. Sorting it last globally would push it past MAX_ROWS and hide money,
    // which is the thing keeping the bucket was meant to prevent.
    const many = Array.from({ length: 20 }, (_, i) => ({
      note: `note ${i}`,
      total: 100 - i,
      count: 1,
    }));
    render(<TopNotesList notes={[{ note: 'No note', total: 9999, count: 1 }, ...many]} />);
    expect(screen.getByText('(no note)')).toBeInTheDocument();
  });
});
