import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestToken } from './gis';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// A token-client stub whose response depends on the prompt it's called with, recording every prompt
// seen. `on` maps a prompt ('' | 'consent') to either a token to resolve or an error to reject.
function stubGoogle(on: { [p: string]: { access_token?: string; error?: string } }): string[] {
  const prompts: string[] = [];
  const initTokenClient = vi.fn(
    (cfg: { callback: (r: { access_token?: string; error?: string }) => void }) => ({
      requestAccessToken: (args: { prompt: string }) => {
        prompts.push(args.prompt);
        cfg.callback(on[args.prompt] ?? { error: 'unexpected_prompt' });
      },
    }),
  );
  Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });
  return prompts;
}

describe('requestToken', () => {
  beforeEach(() => {
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
