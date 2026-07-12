import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { moveItem, useGridReorder } from './use-grid-reorder';

describe('moveItem', () => {
  it('moves an item forward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('moves an item backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('returns the same array reference for a no-op move', () => {
    const arr = ['a', 'b'];
    expect(moveItem(arr, 0, 0)).toBe(arr);
    expect(moveItem(arr, 5, 0)).toBe(arr);
  });
});

// The pressed tile only needs pointer-capture methods (the hook's DragPointer.currentTarget type).
function captureTarget() {
  return { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
}
// A real DOM button so document.elementFromPoint can be mocked to return it — jsdom's closest() and
// getAttribute() then resolve the tile index for real, no cast needed.
function tileEl(index: number) {
  const el = document.createElement('button');
  el.setAttribute('data-reorder-index', String(index));
  return el;
}

describe('useGridReorder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];

  it('a quick tap does not activate a drag and does not suppress the click', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useGridReorder(items, onReorder));
    const p = { pointerId: 1, clientX: 10, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerDown(p));
    act(() => result.current.tileProps(0).onPointerUp(p));
    expect(result.current.dragIndex).toBeNull();
    expect(result.current.consumeDragClick()).toBe(false);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('a long press activates the drag (tile lifts)', () => {
    const { result } = renderHook(() => useGridReorder(items, vi.fn()));
    const p = { pointerId: 1, clientX: 10, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerDown(p));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.dragIndex).toBe(0);
  });

  it('dragging over another tile reorders and persists on drop, suppressing the click once', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useGridReorder(items, onReorder));

    const down = { pointerId: 1, clientX: 10, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerDown(down));
    act(() => {
      vi.advanceTimersByTime(400); // activate
    });

    // Finger now over tile index 2.
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(tileEl(2));
    const move = { pointerId: 1, clientX: 210, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerMove(move));
    expect(result.current.items.map((x) => x.name)).toEqual(['B', 'C', 'A']);

    const up = { pointerId: 1, clientX: 210, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerUp(up));
    expect(onReorder).toHaveBeenCalledExactlyOnceWith([
      { name: 'B' },
      { name: 'C' },
      { name: 'A' },
    ]);
    expect(result.current.consumeDragClick()).toBe(true); // eats the synthetic click
    expect(result.current.consumeDragClick()).toBe(false); // and only once
    spy.mockRestore();
  });

  it('a pointercancel after activation does not eat the next real tap', () => {
    const { result } = renderHook(() => useGridReorder(items, vi.fn()));
    // Long-press to activate, then the OS/multi-touch cancels the gesture — no synthetic click follows.
    const down = { pointerId: 1, clientX: 10, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(0).onPointerDown(down));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => result.current.tileProps(0).onPointerCancel(down));

    // Starting a fresh interaction must clear the stale suppression so the next tap submits/selects.
    const next = { pointerId: 2, clientX: 10, clientY: 10, currentTarget: captureTarget() };
    act(() => result.current.tileProps(1).onPointerDown(next));
    expect(result.current.consumeDragClick()).toBe(false);
  });
});
