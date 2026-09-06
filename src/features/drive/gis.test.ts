import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestToken, clearToken, revokeAccess } from './gis';
import { writeConnection, clearConnection } from './connection';

// A healthy, connected device — the state in which a tap should reuse the grant silently.
function connected(needsReconnect = false): void {
  writeConnection({ connected: true, folderId: 'f1', lastSyncedAt: 1, needsReconnect });
}

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
    clearConnection();
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
    connected();
    const prompts = stubGoogle({ '': { access_token: 'tok-reused' } });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-reused');
    expect(prompts).toEqual(['']); // the nag fix: interactive did NOT force consent
  });

  // THE POPUP BUDGET. Every requestAccessToken call — silent included, it runs display=popup — spends
  // the tap's transient activation, and a browser grants exactly one popup per activation. So a tap
  // that tried silent AND THEN consent had its consent window blocked by Chrome and the connect flow
  // died with "Drive request failed". These assertions are the fix's whole point, and nothing in
  // jsdom can enforce them on its own: it has no popup blocker, so the two-call version passed here
  // for as long as it existed.
  it('a tap spends only ONE popup — a healthy connection never retries with consent', async () => {
    connected();
    const prompts = stubGoogle({
      '': { error: 'no_session' },
      consent: { access_token: 'tok-granted' },
    });
    await expect(requestToken({ interactive: true })).rejects.toThrow('no_session');
    expect(prompts).toEqual(['']);
  });

  it('a tap with nothing connected yet goes STRAIGHT to consent', async () => {
    // The Connect button: there is no grant to reuse, so spending the one popup on a silent attempt
    // that cannot succeed is spending it on nothing.
    const prompts = stubGoogle({ consent: { access_token: 'tok-granted' } });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-granted');
    expect(prompts).toEqual(['consent']);
  });

  it('a tap goes straight to consent once the connection is flagged needsReconnect', async () => {
    // The lapsed grant that auto-sync already discovered. Without this the first tap after a lapse
    // burns its popup on the silent call that just failed in the background.
    connected(true);
    const prompts = stubGoogle({ consent: { access_token: 'tok-granted' } });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-granted');
    expect(prompts).toEqual(['consent']);
  });

  it('a tap rejects when its single attempt fails', async () => {
    const prompts = stubGoogle({ consent: { error: 'access_denied' } });
    await expect(requestToken({ interactive: true })).rejects.toThrow('access_denied');
    expect(prompts).toEqual(['consent']);
  });

  it('reuses a still-valid cached token WITHOUT calling GIS again (no second popup)', async () => {
    connected(); // the silent prompt below is what a healthy connection gets
    const prompts = stubGoogle({ '': { access_token: 'tok-cached', expires_in: '3600' } });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-cached');
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-cached');
    expect(prompts).toEqual(['']); // one GIS call total — the second tap hit the cache, no popup
  });

  it('does not reuse an expired token — re-fetches from GIS', async () => {
    connected(); // the silent prompt below is what a healthy connection gets
    // expires_in below the 5-min safety margin lands the expiry in the past → the cache is stale.
    const prompts = stubGoogle({ '': { access_token: 'tok-short', expires_in: '100' } });
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-short');
    await expect(requestToken({ interactive: true })).resolves.toBe('tok-short');
    expect(prompts).toEqual(['', '']); // two GIS calls — the stale token was not reused
  });

  it('a token cached in localStorage survives a reload (fresh module) — no popup', async () => {
    connected(); // the silent prompt below is what a healthy connection gets
    stubGoogle({ '': { access_token: 'tok-persisted', expires_in: '3600' } });
    await requestToken({ interactive: true }); // writes the cache to localStorage
    vi.resetModules();
    const { requestToken: freshRequestToken } = await import('./gis');
    // No google stub on the fresh module — if it reaches GIS this throws. It must serve from storage.
    Reflect.set(globalThis, 'google', undefined);
    await expect(freshRequestToken({ interactive: false })).resolves.toBe('tok-persisted');
  });

  it('clearToken drops the cache so the next call re-fetches', async () => {
    connected(); // the silent prompt below is what a healthy connection gets
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
