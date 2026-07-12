import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CategoryNameEditor } from './CategoryNameEditor';

// The datalist the editor reads existing names from lives on the page; render it alongside.
function renderEditor(category: string) {
  return render(
    <>
      <datalist id="category-options">
        <option value="Coffee" />
        <option value="Drinks" />
      </datalist>
      <CategoryNameEditor category={category} />
    </>,
  );
}

describe('CategoryNameEditor merge confirmation', () => {
  let requestSubmit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    // requestSubmit isn't meaningfully implemented for a function action in jsdom — stub it so we can
    // assert whether a submit was attempted without firing the server action.
    requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function openAndType(value: string) {
    renderEditor('Coffee');
    fireEvent.click(screen.getByRole('button', { name: 'Coffee' }));
    const input = screen.getByRole('combobox'); // <input list=…> resolves to combobox, not textbox
    fireEvent.change(input, { target: { value } });
    return input;
  }

  it('DEFERS the merge confirm on blur (never sync — that is the loop guard) and merges on accept', () => {
    vi.useFakeTimers();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const input = openAndType('Drinks');

    fireEvent.blur(input);
    // The root-cause guard: confirm() must not fire synchronously inside the blur (that looped forever).
    expect(confirm).not.toHaveBeenCalled();

    vi.runAllTimers(); // the deferred confirm runs after the blur has settled
    expect(confirm).toHaveBeenCalledOnce();
    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it('cancelling the deferred blur confirm reverts and collapses to the label (no refocus)', () => {
    vi.useFakeTimers();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const input = openAndType('Drinks');

    fireEvent.blur(input);
    void act(() => vi.runAllTimers()); // the confirm's setEditing(false) is a state update — flush it

    expect(confirm).toHaveBeenCalledOnce();
    expect(requestSubmit).not.toHaveBeenCalled();
    // Collapsed back to the plain label — the input is gone, so nothing to refocus.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Coffee' })).toBeTruthy();
  });

  it('still saves a plain (non-colliding) rename on blur — no confirm, no defer', () => {
    const input = openAndType('Cafe');
    fireEvent.blur(input);
    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it('Enter behaves identically to blur — deferred confirm, merges on accept', () => {
    vi.useFakeTimers();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const input = openAndType('Drinks');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(confirm).not.toHaveBeenCalled(); // deferred, same as blur

    vi.runAllTimers();
    expect(confirm).toHaveBeenCalledOnce();
    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it('cancelling the deferred Enter confirm reverts and collapses to the label (no refocus)', () => {
    vi.useFakeTimers();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const input = openAndType('Drinks');

    fireEvent.keyDown(input, { key: 'Enter' });
    void act(() => vi.runAllTimers()); // the confirm's setEditing(false) is a state update — flush it

    expect(confirm).toHaveBeenCalledOnce();
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Coffee' })).toBeTruthy();
  });
});
