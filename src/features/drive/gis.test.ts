import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestToken } from './gis';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Pre-insert the GIS script so the loader resolves immediately, and stub the global token client.
describe('requestToken', () => {
  beforeEach(() => {
    for (const el of Array.from(document.querySelectorAll('script'))) el.remove();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    document.head.appendChild(s);
  });

  it('resolves the access token from the GIS callback using the silent prompt', async () => {
    let capturedPrompt: string | undefined;
    const initTokenClient = vi.fn((cfg: { callback: (r: { access_token?: string }) => void }) => ({
      requestAccessToken: (args: { prompt: string }) => {
        capturedPrompt = args.prompt;
        cfg.callback({ access_token: 'tok-123' });
      },
    }));
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });

    await expect(requestToken({ interactive: false })).resolves.toBe('tok-123');
    expect(capturedPrompt).toBe('');
  });

  it('rejects when the callback returns no token, using the consent prompt', async () => {
    let capturedPrompt: string | undefined;
    const initTokenClient = vi.fn((cfg: { callback: (r: { error?: string }) => void }) => ({
      requestAccessToken: (args: { prompt: string }) => {
        capturedPrompt = args.prompt;
        cfg.callback({ error: 'access_denied' });
      },
    }));
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });

    await expect(requestToken({ interactive: true })).rejects.toThrow('access_denied');
    expect(capturedPrompt).toBe('consent');
  });

  it('retries after a failed script load instead of caching the rejection', async () => {
    // Start from a clean head — this test drives its own script injection rather than
    // relying on the beforeEach's pre-inserted script.
    for (const el of Array.from(document.querySelectorAll('script'))) el.remove();
    vi.resetModules();
    const { requestToken: freshRequestToken } = await import('./gis');

    const firstAttempt = freshRequestToken({ interactive: false });
    const firstScript = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    expect(firstScript).not.toBeNull();
    firstScript?.dispatchEvent(new Event('error'));
    await expect(firstAttempt).rejects.toThrow('failed to load Google Identity Services');

    const initTokenClient = vi.fn((cfg: { callback: (r: { access_token?: string }) => void }) => ({
      requestAccessToken: () => cfg.callback({ access_token: 'tok-456' }),
    }));
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });

    const secondAttempt = freshRequestToken({ interactive: false });
    const secondScript = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    expect(secondScript).not.toBeNull();
    secondScript?.dispatchEvent(new Event('load'));
    await expect(secondAttempt).resolves.toBe('tok-456');
  });
});
