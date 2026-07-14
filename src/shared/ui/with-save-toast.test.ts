import { describe, it, expect, beforeEach } from 'vitest';
import { getToasts, resetToasts } from './toast';
import { withSaveToast } from './with-save-toast';

describe('withSaveToast', () => {
  beforeEach(() => resetToasts());

  it('runs the action then shows a success toast', async () => {
    let ran = false;
    await withSaveToast(() => {
      ran = true;
      return Promise.resolve();
    }, 'Budget set')();
    expect(ran).toBe(true);
    const toasts = getToasts();
    expect(toasts.at(-1)?.message).toBe('Budget set');
    expect(toasts.at(-1)?.tone).toBe('polite');
  });

  it('defaults the message to "Saved"', async () => {
    await withSaveToast(() => Promise.resolve())();
    expect(getToasts().at(-1)?.message).toBe('Saved');
  });

  it('shows an error toast and rethrows when the action fails', async () => {
    const boom = withSaveToast(() => Promise.reject(new Error('nope')));
    await expect(boom()).rejects.toThrow('nope');
    const last = getToasts().at(-1);
    expect(last?.tone).toBe('assertive');
    expect(last?.message).toContain('save');
  });

  it('passes arguments through to the wrapped action', async () => {
    const seen: unknown[] = [];
    await withSaveToast((a: string, b: number) => {
      seen.push(a, b);
      return Promise.resolve();
    })('x', 2);
    expect(seen).toEqual(['x', 2]);
  });
});
