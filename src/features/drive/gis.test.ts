import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestToken } from './gis';

// Pre-insert the GIS script so the loader resolves immediately, and stub the global token client.
describe('requestToken', () => {
  beforeEach(() => {
    for (const el of Array.from(document.querySelectorAll('script'))) el.remove();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    document.head.appendChild(s);
  });

  it('resolves the access token from the GIS callback', async () => {
    const initTokenClient = vi.fn((cfg: { callback: (r: { access_token?: string }) => void }) => ({
      requestAccessToken: () => cfg.callback({ access_token: 'tok-123' }),
    }));
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });

    await expect(requestToken({ interactive: false })).resolves.toBe('tok-123');
  });

  it('rejects when the callback returns no token', async () => {
    const initTokenClient = vi.fn((cfg: { callback: (r: { error?: string }) => void }) => ({
      requestAccessToken: () => cfg.callback({ error: 'access_denied' }),
    }));
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });

    await expect(requestToken({ interactive: true })).rejects.toThrow('access_denied');
  });
});
