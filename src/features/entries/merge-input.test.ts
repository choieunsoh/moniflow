import { describe, it, expect } from 'vitest';
import { parseMergeInput } from './merge-input';

function fd(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe('parseMergeInput', () => {
  it('preserves `from` verbatim and trims only `to`', () => {
    // `from` is an exact DB category key (a hidden field bound from the stored value); a
    // whitespace-bearing fragment must survive so the WHERE match hits the right rows.
    expect(parseMergeInput(fd({ from: 'อาหาร ', to: '  กิน  ' }))).toEqual({
      from: 'อาหาร ',
      to: 'กิน',
    });
  });

  it('renames a whitespace-fragmented category to its clean name (not a no-op)', () => {
    // from='ช็อปปิ้ง ' (trailing space) vs to='ช็อปปิ้ง': these are DIFFERENT keys, so this is a
    // real rename, not a no-op — this is the exact fragmentation the feature exists to fix.
    expect(parseMergeInput(fd({ from: 'ช็อปปิ้ง ', to: 'ช็อปปิ้ง' }))).toEqual({
      from: 'ช็อปปิ้ง ',
      to: 'ช็อปปิ้ง',
    });
  });

  it('rejects when `from` equals the trimmed `to` (genuine no-op)', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร', to: ' อาหาร ' }))).toBeNull();
  });

  it('rejects an empty or whitespace-only `to`', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร', to: '   ' }))).toBeNull();
  });

  it('rejects an empty `from`', () => {
    expect(parseMergeInput(fd({ from: '', to: 'อาหาร' }))).toBeNull();
  });

  it('rejects a missing field', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร' }))).toBeNull();
  });
});
