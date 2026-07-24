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
