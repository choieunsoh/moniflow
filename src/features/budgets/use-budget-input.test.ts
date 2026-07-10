import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBudgetInput } from './use-budget-input';

// Fabricate just the fields the handlers read.
const blur = (value: string) => ({ currentTarget: { value } });
const enter = (blurFn: () => void) => ({
  key: 'Enter',
  preventDefault: () => {},
  currentTarget: { blur: blurFn },
});

describe('useBudgetInput', () => {
  it('commits a changed, valid amount on blur', () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useBudgetInput(undefined, onSave));
    result.current.onBlur(blur('9000'));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(9000);
  });

  it('does not re-commit an unchanged value', () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useBudgetInput(5000, onSave));
    result.current.onBlur(blur('5000')); // same as saved baseline
    expect(onSave).not.toHaveBeenCalled();
  });

  it('commits only once when blurred twice without a change between', () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useBudgetInput(undefined, onSave));
    result.current.onBlur(blur('9000'));
    result.current.onBlur(blur('9000'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('ignores blank and invalid input (blank = keep, not remove)', () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useBudgetInput(1000, onSave));
    result.current.onBlur(blur(''));
    result.current.onBlur(blur('  '));
    result.current.onBlur(blur('-5'));
    result.current.onBlur(blur('abc'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blurs the field on Enter (which triggers the commit path)', () => {
    const onSave = vi.fn();
    const blurFn = vi.fn();
    const { result } = renderHook(() => useBudgetInput(undefined, onSave));
    result.current.onKeyDown(enter(blurFn));
    expect(blurFn).toHaveBeenCalledOnce();
  });
});
