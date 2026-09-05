import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BottomBar } from './BottomBar';

const pathname = vi.fn(() => '/');

vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
  useSearchParams: () => new URLSearchParams(),
}));

// The backup dot is app-wide state read from OPFS + localStorage; none of it is what this file is
// about, and left real it would drag a database into a test about one link.
vi.mock('../use-backup-status', () => ({ useBackupStatus: () => ({ overdue: false }) }));

const fab = () => screen.queryByLabelText('Add expense');

describe('BottomBar', () => {
  beforeEach(() => pathname.mockReturnValue('/'));

  it('offers the expense FAB on an ordinary tab', () => {
    render(<BottomBar />);
    expect(fab()).not.toBeNull();
  });

  // The FAB's whole job is "start a new expense". On /entries/new it is a link to the page you are
  // already looking at: a 64px primary action, the largest control on screen, that does nothing.
  it('drops the FAB on the new-entry screen, where it points at the current page', () => {
    pathname.mockReturnValue('/entries/new');
    render(<BottomBar />);
    expect(fab()).toBeNull();
  });

  // Worse than dead here: /entries/edit holds a half-typed edit, and this navigates away from it
  // with no warning and no undo. The flow has its own CloseButton for leaving deliberately.
  it('drops the FAB on the edit screen, where it would abandon an in-progress edit', () => {
    pathname.mockReturnValue('/entries/edit');
    render(<BottomBar />);
    expect(fab()).toBeNull();
  });

  // Only the circle goes. The four tabs keep their slots so the bar does not restructure under the
  // thumb the moment you open the keypad — the middle column stays an empty spacer.
  it('keeps every tab in place on an entry screen', () => {
    pathname.mockReturnValue('/entries/new');
    render(<BottomBar />);
    // Scoped to the bar itself: the More SHEET renders its own destinations into the same tree, so
    // an unscoped getByText('More') matches the tab and the sheet's heading alike.
    const bar = within(screen.getByRole('navigation', { name: 'Primary' }));
    for (const tab of ['Home', 'Records', 'Trends', 'More']) {
      expect(bar.getByText(tab)).toBeDefined();
    }
  });
});
