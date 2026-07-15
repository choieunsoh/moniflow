import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveFile } from './save-file';

// jsdom implements neither the Web Share API, object URLs, nor matchMedia, so every platform edge is
// stubbed. coarse=true means "a phone" — see the pointer-media gate in save-file.ts.
const share = vi.fn<(data: ShareData) => Promise<void>>();
const canShare = vi.fn<(data: ShareData) => boolean>();
const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

function onPhone(coarse: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('coarse') }));
}

beforeEach(() => {
  onPhone(true);
  vi.stubGlobal('navigator', { canShare, share });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('saveFile', () => {
  it('shares the file when the platform can, without downloading', async () => {
    canShare.mockReturnValue(true);
    share.mockResolvedValue();

    await saveFile('moniflow-2026-07-15.csv', 'text/csv', 'date,amount\n');

    const [{ files }] = share.mock.calls[0];
    expect(files?.[0].name).toBe('moniflow-2026-07-15.csv');
    expect(await files?.[0].text()).toBe('date,amount\n');
    expect(click).not.toHaveBeenCalled();
  });

  it('downloads when the platform cannot share files', async () => {
    canShare.mockReturnValue(false);

    await saveFile('moniflow.csv', 'text/csv', 'date,amount\n');

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  // Desktop Chrome answers canShare({files}) === true and then opens the Windows share flyout, which
  // has no Drive in it. A capability check alone would silently swap the download for something worse.
  it('downloads on a desktop even though it claims it can share', async () => {
    onPhone(false);
    canShare.mockReturnValue(true);

    await saveFile('moniflow.csv', 'text/csv', 'date,amount\n');

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it('does not download when the user dismisses the share sheet', async () => {
    canShare.mockReturnValue(true);
    share.mockRejectedValue(new DOMException('cancelled', 'AbortError'));

    await saveFile('moniflow.csv', 'text/csv', 'date,amount\n');

    expect(click).not.toHaveBeenCalled();
  });

  it('falls back to a download when sharing fails for any other reason', async () => {
    canShare.mockReturnValue(true);
    share.mockRejectedValue(new DOMException('no activation', 'NotAllowedError'));

    await saveFile('moniflow.csv', 'text/csv', 'date,amount\n');

    expect(click).toHaveBeenCalled();
  });
});
