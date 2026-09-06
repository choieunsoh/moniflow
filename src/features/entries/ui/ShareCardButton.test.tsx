import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShareCardButton } from './ShareCardButton';
import type { DonutSlice } from '../donut';

const saveFile = vi.hoisted(() =>
  vi.fn<(n: string, t: string, b: string | Blob) => Promise<void>>(),
);
const toast = vi.hoisted(() => {
  const fn = vi.fn<(m: string) => void>();
  return Object.assign(fn, { error: vi.fn<(m: string) => void>() });
});

vi.mock('@shared/save-file', () => ({ saveFile }));
vi.mock('@shared/ui/toast', () => ({ toast }));

// jsdom has no canvas: getContext returns null and the component would take its "couldn't make the
// card" branch on every test. Stubbing the two calls it makes keeps the drawing itself out of scope
// (that is the untested half by design) while leaving the OUTCOME — what the user is told — testable.
//
// defineProperty rather than vi.spyOn(...).mockReturnValue(fakeCtx): a partial 2D context can only be
// passed to the typed spy through a double assertion, and `as` is banned repo-wide. A property
// descriptor's `value` is untyped, so the stub goes in honestly and comes back out in afterEach.
const CANVAS_STUBS = ['getContext', 'toDataURL'] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

function stubCanvas() {
  // Every 2D call the renderer makes is a no-op here; the numbers it would draw are asserted in
  // share-card.test.ts, which is where the decisions actually live.
  const ctx: unknown = new Proxy(
    {},
    {
      // measureText is the one call whose RETURN the renderer reads — it steps the KPI type down
      // until the string fits. Zero width means "always fits", which keeps the shrink loop out of
      // these tests; the fitting itself is geometry, and geometry is the browser's to prove.
      get: (_target, key) => (key === 'measureText' ? () => ({ width: 0 }) : () => undefined),
      set: () => true,
    },
  );
  const values: Record<string, unknown> = {
    getContext: () => ctx,
    // A one-pixel PNG; only its base64 tail is read, by atob.
    toDataURL: () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
  };
  // The card strokes the app mark through Path2D, which jsdom has no constructor for at all — an
  // unstubbed `new Path2D(d)` throws ReferenceError and the component reports "couldn't make the
  // card", turning the success cases red for a reason that has nothing to do with them.
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(readonly d?: string) {}
    },
  );
  for (const key of CANVAS_STUBS) {
    originals.set(key, Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key));
    Object.defineProperty(HTMLCanvasElement.prototype, key, {
      value: values[key],
      configurable: true,
      writable: true,
    });
  }
}

function restoreCanvas() {
  for (const [key, descriptor] of originals) {
    if (descriptor === undefined) Reflect.deleteProperty(HTMLCanvasElement.prototype, key);
    else Object.defineProperty(HTMLCanvasElement.prototype, key, descriptor);
  }
  originals.clear();
}

const slices: DonutSlice[] = [{ name: 'Food', value: 500, color: '#03999d', count: 3 }];

const props = {
  label: '18 Aug – 17 Sep 2026',
  grossSpend: 500,
  count: 3,
  slices,
  totalStatus: null,
  forward: null,
};

describe('ShareCardButton', () => {
  afterEach(() => {
    restoreCanvas();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    saveFile.mockReset();
    toast.mockReset();
    toast.error.mockReset();
  });

  it('hands the card to saveFile as a PNG named after the cycle', () => {
    stubCanvas();
    saveFile.mockResolvedValue();
    render(<ShareCardButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /share this cycle/i }));

    const [name, type, body] = saveFile.mock.calls[0] ?? [];
    expect(type).toBe('image/png');
    expect(name).toBe('moniflow-18-aug-–-17-sep-2026.png');
    expect(body).toBeInstanceOf(Blob);
  });

  // The bug this file exists for. The first cut called `void saveFile(...)`, so the whole feature was
  // silent in BOTH directions: Chrome files a download away in a toolbar bubble, and a rejected share
  // sheet said nothing either — from inside the page the button looked inert. A test that only
  // asserted saveFile was called would have passed the whole time.
  it('confirms the save, so a success is not indistinguishable from doing nothing', async () => {
    stubCanvas();
    saveFile.mockResolvedValue();
    render(<ShareCardButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /share this cycle/i }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('Card saved'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('surfaces a saveFile rejection instead of swallowing it', async () => {
    stubCanvas();
    saveFile.mockRejectedValue(new Error('no share target'));
    render(<ShareCardButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /share this cycle/i }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalledWith('Card saved');
  });

  it('surfaces a failed render without reaching saveFile', () => {
    // getContext left unstubbed — jsdom returns null, which is exactly what a browser with canvas
    // disabled would do.
    render(<ShareCardButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /share this cycle/i }));

    expect(saveFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
