import { describe, it, expect } from 'vitest';
import { parseMergeInput } from './merge-input';

function fd(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe('parseMergeInput', () => {
  it('accepts a valid from/to pair, trimmed', () => {
    expect(parseMergeInput(fd({ from: ' ช็อปปิ้ง ชมพู่ ', to: ' ช็อปปิ้ง ' }))).toEqual({
      from: 'ช็อปปิ้ง ชมพู่',
      to: 'ช็อปปิ้ง',
    });
  });

  it('rejects when from and to are the same after trimming', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร', to: ' อาหาร ' }))).toBeNull();
  });

  it('rejects an empty or whitespace-only to', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร', to: '   ' }))).toBeNull();
  });

  it('rejects a missing field', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร' }))).toBeNull();
  });
});
