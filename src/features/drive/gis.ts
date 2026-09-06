'use client';

import { GOOGLE_CLIENT_ID } from './client-id';
import { DRIVE_SCOPE } from './sync-decision';
import { readConnection } from './connection';

// Lazy bridge to Google Identity Services. The GIS script is injected on first use only — never on
// the app's critical path. requestToken wraps the callback-based token client in a promise.
//
// Silent (interactive: false) uses prompt: '' — succeeds only while the user's Google session is alive
// and consent already granted; otherwise it rejects and the caller degrades to needsReconnect. The
// interactive path tries silent first, then prompt: 'consent'.
//
// THE popup fix: the token model opens a fresh auth flow (a popup / account chooser) on EVERY
// requestAccessToken call, because it has no refresh token and never keeps the issued token. Access
// tokens are valid ~1h though — so we cache the token with its expiry and reuse it. A backup within
// the token's life issues ZERO GIS calls and shows NO popup, across reloads and app reopens.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;

// Cached access token. In-memory for the page, mirrored to localStorage so a reload / app reopen within
// the token's ~1h life reuses it instead of popping the account chooser again.
// ponytail: an access token in localStorage is a bounded exposure — drive.file scope only (files this
// app created), ~1h TTL, single-user personal app with no other secrets. Downgrade to sessionStorage
// if you want a smaller window at the cost of a popup on every cold app open.
type CachedToken = { token: string; expiresAt: number };
const TOKEN_KEY = 'moniflow-drive-token';
const EXPIRY_MARGIN_S = 300; // treat a token as dead 5 min early, so a backup never starts on a stale one
let tokenMemo: CachedToken | null = null;

function loadCachedToken(): CachedToken | null {
  if (tokenMemo !== null) return tokenMemo;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw === null) return null;
    const p: unknown = JSON.parse(raw);
    if (
      typeof p === 'object' &&
      p !== null &&
      'token' in p &&
      'expiresAt' in p &&
      typeof p.token === 'string' &&
      typeof p.expiresAt === 'number'
    ) {
      tokenMemo = { token: p.token, expiresAt: p.expiresAt };
      return tokenMemo;
    }
  } catch {
    // fall through to null — a corrupt cache just means we fetch a fresh token
  }
  return null;
}

function validCachedToken(): string | null {
  const c = loadCachedToken();
  return c !== null && c.expiresAt > Date.now() ? c.token : null;
}

// expires_in is typed as string by @types/google.accounts but arrives as a number at runtime; Number()
// accepts both without a cast. A missing/garbage value → no caching (safe: we just re-fetch next time).
function storeCachedToken(token: string, expiresIn: string | number | undefined): void {
  const secs = Number(expiresIn);
  if (!Number.isFinite(secs) || secs <= 0) return;
  tokenMemo = { token, expiresAt: Date.now() + Math.max(0, secs - EXPIRY_MARGIN_S) * 1000 };
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenMemo));
  } catch {
    // storage full / blocked — in-memory cache still works for this page
  }
}

// Drop the cached token. The in-memory copy AND the persisted one.
export function clearToken(): void {
  tokenMemo = null;
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

// Best-effort revocation of the Google grant, for "Disconnect". Only a currently-valid access token
// can revoke the grant, so we revoke the cached one when we hold it; if none is valid we skip rather
// than pop a dialog just to fetch a token to revoke (disconnect must never prompt). The local token
// cache is cleared either way. Without this, "Disconnect" only forgets the grant locally — the app
// could still mint tokens silently until the user revokes it by hand in their Google account.
export async function revokeAccess(): Promise<void> {
  const token = validCachedToken();
  clearToken();
  if (token === null) return;
  await loadGis().catch(() => undefined);
  if (typeof google === 'undefined' || google.accounts?.oauth2 === undefined) return;
  await new Promise<void>((resolve) => {
    google.accounts.oauth2.revoke(token, () => resolve());
  });
}

function loadGis(): Promise<void> {
  if (loading !== null) return loading;
  const attempt = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'));
      return;
    }
    if (document.querySelector(`script[src="${GIS_SRC}"]`) !== null) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  loading = attempt.catch((err: unknown) => {
    loading = null; // let the next call retry a failed load
    throw err;
  });
  return loading;
}

async function requestTokenRaw(prompt: '' | 'consent'): Promise<string> {
  await loadGis();
  if (typeof google === 'undefined' || google.accounts?.oauth2 === undefined) {
    throw new Error('Google Identity Services unavailable');
  }
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.access_token !== undefined && resp.access_token !== '') {
          storeCachedToken(resp.access_token, resp.expires_in);
          resolve(resp.access_token);
        } else reject(new Error(resp.error ?? 'no access token'));
      },
      error_callback: (err) => reject(new Error(err.type)),
    });
    client.requestAccessToken({ prompt });
  });
}

// ONE popup per call, and the prompt is CHOSEN rather than retried.
//
// prompt:'' reuses an existing grant with no account chooser or consent dialog (the documented
// re-auth path), and that is still what a healthy connection gets — tapping "Back up now" must not
// re-prompt while the Google session is alive, which is why passing 'consent' unconditionally was
// wrong. But `prompt:''` is NOT a quiet side channel: GIS opens a real popup for it (display=popup),
// and a browser grants exactly ONE popup per transient user activation. So the previous shape —
// await silent, then fall back to consent — spent the tap's single popup on the attempt that had
// just failed, and Chrome blocked the consent window that mattered. Connecting a fresh device was
// impossible: every tap ended in "Drive request failed — reconnect and try again".
//
// The connection state already knows which prompt can succeed, so ask it instead of guessing and
// retrying: a grant we believe in gets the silent path, and no grant (a first connect, a disconnect,
// or a lapse auto-sync already flagged) goes straight to consent. A silent attempt that fails no
// longer retries here — backupNow records needsReconnect on the way out, so the NEXT tap is a
// consent tap.
//
// Note this cannot be caught below jsdom: it has no popup blocker, so the two-call version passed
// its tests for as long as it existed. See the popup-budget cases in gis.test.ts.
export async function requestToken(opts: { interactive: boolean }): Promise<string> {
  const cached = validCachedToken();
  if (cached !== null) return cached; // no GIS call, no popup — the whole point
  if (!opts.interactive) return requestTokenRaw('');
  const conn = readConnection();
  return requestTokenRaw(conn.connected && !conn.needsReconnect ? '' : 'consent');
}
