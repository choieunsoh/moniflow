'use client';

import { GOOGLE_CLIENT_ID } from './client-id';
import { DRIVE_SCOPE } from './sync-decision';

// Lazy bridge to Google Identity Services. The GIS script is injected on first use only — never on
// the app's critical path. requestToken wraps the callback-based token client in a promise.
//
// Silent (interactive: false) uses prompt: '' — succeeds only while the user's Google session is alive
// and consent already granted; otherwise it rejects and the caller degrades to needsReconnect. The
// interactive path (prompt: 'consent') is used from the Connect / Back-up-now taps.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;

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
        if (resp.access_token !== undefined && resp.access_token !== '') resolve(resp.access_token);
        else reject(new Error(resp.error ?? 'no access token'));
      },
      error_callback: (err) => reject(new Error(err.type)),
    });
    client.requestAccessToken({ prompt });
  });
}

// Silent first: prompt:'' reuses an existing grant with NO account chooser or consent dialog (the
// documented re-auth path — see the token-model migration guide). The auto/background path stops here.
// A user-initiated call (a tap) falls back to the full consent flow ONLY when silent fails — a lapsed
// session or the first-ever grant — so tapping "Back up now" never re-prompts while the Google session
// is alive. Passing prompt:'consent' unconditionally (the old behavior) forced consent on every tap.
// ponytail: assumes GIS surfaces a silent-prompt failure via callback/error_callback (it does — both
// are wired above). If a silent request is ever seen to hang, wrap the first await in a timeout.
export async function requestToken(opts: { interactive: boolean }): Promise<string> {
  try {
    return await requestTokenRaw('');
  } catch (err) {
    if (!opts.interactive) throw err;
    return requestTokenRaw('consent');
  }
}
