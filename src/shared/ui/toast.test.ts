import { describe, it, expect, beforeEach } from 'vitest';
import { toast, getToasts, dismissToast, resetToasts } from './toast';

describe('toast store', () => {
  beforeEach(() => resetToasts());

  it('toast(message) pushes a polite toast and returns its id', () => {
    const id = toast('Saved');
    const all = getToasts();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id, message: 'Saved', tone: 'polite' });
    expect(all[0].action).toBeUndefined();
  });

  it('toast.action attaches a label + onClick', () => {
    const onClick = () => {};
    toast.action('Merged into Cash', { label: 'Undo', onClick });
    const [t] = getToasts();
    expect(t.action).toEqual({ label: 'Undo', onClick });
  });

  it('toast.error marks the tone assertive', () => {
    toast.error('Import failed');
    expect(getToasts()[0].tone).toBe('assertive');
  });

  it('dismissToast removes only the matching toast', () => {
    const a = toast('A');
    const b = toast('B');
    dismissToast(a);
    expect(getToasts().map((t) => t.id)).toEqual([b]);
  });

  it('ids are unique and increasing', () => {
    const a = toast('A');
    const b = toast('B');
    expect(b).toBeGreaterThan(a);
  });
});
