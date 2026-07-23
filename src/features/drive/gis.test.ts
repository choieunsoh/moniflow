import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestToken, clearToken, revokeAccess } from './gis';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

type StubResponse = { access_token?: string; error?: string; expires_in?: string };

// A token-client stub whose response depends on the prompt it's called with, recording every prompt
// seen. `on` maps a prompt ('' | 'consent') to a token/error (optionally with expires_in for caching).
function stubGoogle(on: { [p: string]: StubResponse }): string[] {
  const prompts: string[] = [];
  const initTokenClient = vi.fn((cfg: { callback: (r: StubResponse) => void }) => ({
    requestAccessToken: (args: { prompt: string }) => {
      prompts.push(args.prompt);
      cfg.callback(on[args.prompt] ?? { error: 'unexpected_prompt' });
    },
  }));
  Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });
  return prompts;
}

describe('requestToken', () => {
  beforeEach(() => {
    clearToken(); // cached token is module state — a leak across tests would hide a real GIS call
    localStorage.clear();
    for (const el of Array.from(document.querySelectorAll('script'))) el.remove();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    document.head.appendChild(s);
  });

  it('auto (non-interactive) uses only the silent prompt and never falls back to consent', async () => {
    const prompts = stubGoogle({ '': { access_token: 'tok-silent' } });
    await expect(requestToken({ interactive: false })).resolves.toBe('tok-silent');
    expect(prompts).toEqual(['']);
  });

  it('auto (non-interactive) rejects on silent failure without prompting for consent', async () => {
    const prompts = stubGoogle({ '': { error: 'no_session' } });
    await expect(requestToken({ interactive: false })).rejects.toThrow('no_session');
    expect(prompts).toEqual(['']); // no consent attempt — the whole point of the silent path
  });

  it('a tap reuses an existing grant SILENTLY — no consent dialog when the session is alive', async () => {
    const prompts = stubGoogle({ '': { access_token: 'tok-reused' } });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-reused');
    expect(prompts).toEqual(['']); // the nag fix: interactive did NOT force consent
  });

  it('a tap falls back to consent only when the silent path fails', async () => {
    const prompts = stubGoogle({
      '': { error: 'no_session' },
      consent: { access_token: 'tok-granted' },
    });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-granted');
    expect(prompts).toEqual(['', 'consent']); // silent first, then the consent flow
  });

  it('a tap rejects when both the silent and the consent attempts fail', async () => {
    const prompts = stubGoogle({
      '': { error: 'no_session' },
      consent: { error: 'access_denied' },
    });
    await expect(requestToken({ interactive: true })).rejects.toThrow('access_denied');
    expect(prompts).toEqual(['', 'consent']);
  });

  it('reuses a still-valid cached token WITHOUT calling GIS again (no second popup)', async () => {
    const prompts = stubGoogle({ '': { access_token: 'tok-cached', expires_in: '3600' } });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-cached');
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-cached');
    expect(prompts).toEqual(['']); // one GIS call total — the second tap hit the cache, no popup
  });

  it('does not reuse an expired token — re-fetches from GIS', async () => {
    // expires_in below the 5-min safety margin lands the expiry in the past → the cache is stale.
    const prompts = stubGoogle({ '': { access_token: 'tok-short', expires_in: '100' } });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-short');
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-short');
    expect(prompts).toEqual(['', '']); // two GIS calls — the stale token was not reused
  });

  it('a token cached in localStorage survives a reload (fresh module) — no popup', async () => {
    stubGoogle({ '': { access_token: 'tok-persisted', expires_in: '3600' } });
    await requestToken({ interactive: true }); // writes the cache to localStorage
    vi.resetModules();
    const { requestToken: freshRequestToken } = await import('./gis');
    // No google stub on the fresh module — if it reaches GIS this throws. It must serve from storage.
    Reflect.set(globalThis, 'google', undefined);
    await expect(freshRequestToken({ interactive: false })).resolves.toBe('tok-persisted');
  });

  it('clearToken drops the cache so the next call re-fetches', async () => {
    const prompts = stubGoogle({ '': { access_token: 'tok-x', expires_in: '3600' } });
    await requestToken({ interactive: true });
    clearToken();
    await requestToken({ interactive: true });
    expect(prompts).toEqual(['', '']); // cache cleared → GIS called again
  });

  it('revokeAccess revokes the cached token with Google and clears the cache', async () => {
    const revoke = vi.fn((_t: string, done: () => void) => done());
    const initTokenClient = vi.fn((cfg: { callback: (r: StubResponse) => void }) => ({
      requestAccessToken: () => cfg.callback({ access_token: 'tok-rev', expires_in: '3600' }),
    }));
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient, revoke } } });
    await requestToken({ interactive: true }); // caches tok-rev
    await revokeAccess();
    expect(revoke).toHaveBeenCalledWith('tok-rev', expect.any(Function));
    // cache cleared → a subsequent request must hit GIS again
    await requestToken({ interactive: false });
    expect(initTokenClient).toHaveBeenCalledTimes(2);
  });

  it('revokeAccess skips revoke when no valid token is cached, but still clears locally', async () => {
    const revoke = vi.fn();
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { revoke } } });
    await revokeAccess(); // nothing cached → nothing to revoke without prompting
    expect(revoke).not.toHaveBeenCalled();
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

    stubGoogle({ '': { access_token: 'tok-456' } });

    const secondAttempt = freshRequestToken({ interactive: false });
    const secondScript = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    expect(secondScript).not.toBeNull();
    secondScript?.dispatchEvent(new Event('load'));
    await expect(secondAttempt).resolves.toBe('tok-456');
  });
});
