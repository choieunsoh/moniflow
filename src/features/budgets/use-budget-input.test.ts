import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBudgetInput, formatBudgetAmount } from './use-budget-input';

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

describe('formatBudgetAmount', () => {
  it('groups thousands, passes through blank and non-numeric', () => {
    expect(formatBudgetAmount('')).toBe('');
    expect(formatBudgetAmount('  ')).toBe('');
    expect(formatBudgetAmount('30000')).toBe('30,000');
    expect(formatBudgetAmount('30,000')).toBe('30,000');
    expect(formatBudgetAmount('abc')).toBe('abc');
  });
});

describe('useBudgetInput commit tolerates grouping', () => {
  it('commits a grouped string as its numeric value and no-ops on re-blur', () => {
    const saved: number[] = [];
    const { result } = renderHook(() => useBudgetInput(undefined, (n) => saved.push(n)));
    result.current.onBlur({ currentTarget: { value: '30,000' } });
    expect(saved).toEqual([30000]);
    result.current.onBlur({ currentTarget: { value: '30,000' } }); // unchanged → no second write
    expect(saved).toEqual([30000]);
  });
});
