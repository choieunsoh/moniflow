import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock Next's client router + URL. `state.q` is the current ?q= value; flip it between renders to
// simulate navigation. vi.hoisted so the mock factory can close over them.
const { replace, state } = vi.hoisted(() => ({ replace: vi.fn(), state: { q: '' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(state.q ? `q=${encodeURIComponent(state.q)}` : ''),
}));

import { SearchBox } from './SearchBox';

describe('SearchBox navigation', () => {
  beforeEach(() => {
    replace.mockClear();
    state.q = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The reported bug: on /records?q=… the search field (which lives in the layout and survives
  // navigation) held a stale value; leaving the page reset the URL query, and the mismatch fired
  // router.replace straight back to the search — you could never leave.
  it('does NOT navigate back when you leave an active search (field blurred)', () => {
    state.q = 'cash';
    const { rerender } = render(<SearchBox suggestions={[]} />);

    // Tapping a nav tab blurs the field, then the URL query clears as the new page loads.
    fireEvent.blur(screen.getByRole('combobox', { name: 'Search records' }));
    state.q = '';
    rerender(<SearchBox suggestions={[]} />);
    void act(() => vi.advanceTimersByTime(300));

    expect(replace).not.toHaveBeenCalled();
  });

  it('still runs the live search: typing in the focused field navigates to /records', () => {
    render(<SearchBox suggestions={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Search records' })); // expand the field
    const input = screen.getByRole('combobox', { name: 'Search records' });
    input.focus();
    fireEvent.change(input, { target: { value: 'coffee' } });
    void act(() => vi.advanceTimersByTime(300));

    expect(replace).toHaveBeenCalledWith('/records?q=coffee');
  });
});
