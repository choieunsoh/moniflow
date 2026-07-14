import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { bumpDataVersion, useDataVersion } from './data-version';

describe('data-version', () => {
  it('re-renders subscribers with a new value on bump', () => {
    const { result } = renderHook(() => useDataVersion());
    const before = result.current;
    act(() => bumpDataVersion());
    expect(result.current).toBe(before + 1);
  });
});
