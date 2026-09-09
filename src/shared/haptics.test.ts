import { describe, it, expect, vi, afterEach } from 'vitest';
import { buzz } from './haptics';

function withVibrate(impl: ((pattern: number) => boolean) | null) {
  if (impl === null) {
    Reflect.deleteProperty(navigator, 'vibrate');
    return null;
  }
  const spy = vi.fn(impl);
  Object.defineProperty(navigator, 'vibrate', { value: spy, configurable: true, writable: true });
  return spy;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'vibrate');
});

// A keypad on a phone should feel like keys. This is the whole feature: one short pulse, best-effort.
describe('buzz', () => {
  it('pulses for the given duration', () => {
    const spy = withVibrate(() => true);
    buzz(10);
    expect(spy).toHaveBeenCalledWith(10);
  });

  // jsdom has no vibrate, and neither does any iOS browser — Safari has never shipped the Vibration
  // API. A missing one must be a silent no-op, never an exception on every keystroke.
  it('does nothing where the API is missing', () => {
    withVibrate(null);
    expect(() => buzz(10)).not.toThrow();
  });

  // Some browsers refuse (a document without user activation, a battery-saver mode) by returning
  // false rather than throwing. Nothing depends on the answer, so nothing reads it.
  it('ignores a refusal', () => {
    withVibrate(() => false);
    expect(() => buzz()).not.toThrow();
  });
});
