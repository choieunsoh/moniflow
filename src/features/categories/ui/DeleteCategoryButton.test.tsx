import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DeleteCategoryButton } from './DeleteCategoryButton';

describe('DeleteCategoryButton (two-tap arm-in-place)', () => {
  let requestSubmit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    // The armed tap submits via form.requestSubmit(); stub it so we can assert without firing the action.
    requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts disarmed — a plain trash button, not a submit, and does nothing to the form', () => {
    render(<DeleteCategoryButton category="Snacks" />);
    const btn = screen.getByRole('button', { name: 'Delete Snacks' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it('first tap arms it — relabels to a confirm, still no delete', () => {
    render(<DeleteCategoryButton category="Snacks" />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Snacks' }));

    expect(screen.getByRole('button', { name: 'Confirm delete Snacks' })).toBeTruthy();
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it('second tap submits the delete', () => {
    render(<DeleteCategoryButton category="Snacks" />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Snacks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Snacks' }));

    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it('auto-disarms after 3s without a second tap (no accidental delete)', () => {
    vi.useFakeTimers();
    render(<DeleteCategoryButton category="Snacks" />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Snacks' }));
    expect(screen.getByRole('button', { name: 'Confirm delete Snacks' })).toBeTruthy();

    void act(() => vi.advanceTimersByTime(3000));

    expect(screen.getByRole('button', { name: 'Delete Snacks' })).toBeTruthy();
    expect(requestSubmit).not.toHaveBeenCalled();
  });
});
