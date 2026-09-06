// Thin wrappers over the Drive REST v3 API. Given an access token, do one thing each. No app logic —
// the pure decisions live in sync-decision.ts. JSON responses are narrowed via `unknown` + guards
// (no `as`, no `any`). `uploadBackup` upserts by name so a same-day re-backup replaces the day's file.

import type { DriveFile } from './sync-decision';
import { clearToken } from './gis';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Google explains every failure in the response body, and this wrapper used to drop it on the floor
// and keep the bare status. "Drive request failed: 401" is not a diagnosis — 401 with a token minted
// seconds earlier means something quite different from 401 with a stale one, and only the body says
// which. Endpoint included: knowing whether it was the file list, the folder create or the upload
// that was refused narrows it further.
async function detail(res: Response): Promise<string> {
  let body = '';
  try {
    body = await res.text();
  } catch {
    // a body that cannot be read is not worth failing over — the status still travels
  }
  let message = body.slice(0, 300);
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const e = parsed.error;
      if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') {
        message = e.message;
      }
    }
  } catch {
    // not JSON — the raw text above is what there is
  }
  const path = new URL(res.url === '' ? 'https://x/unknown' : res.url).pathname;
  return message === '' ? ` (${path})` : ` ${message} (${path})`;
}

async function driveFetch(token: string, url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  // 401 is Google saying this token is dead — revoked, or the grant re-consented somewhere else.
  // Our cache cannot know that on its own: validCachedToken only compares expiresAt to the clock, so
  // it keeps handing the same corpse back, WITHOUT calling GIS, for as long as the recorded expiry
  // says it is fine. That is a trap with no exit — no popup ever opens, nothing re-mints, and every
  // retry fails identically while the UI advises "reconnect and try again". Dropping it here is what
  // makes the next attempt an actual token request. Only 401: a 403 or a 500 says nothing about the
  // token, and discarding it there would buy a needless consent prompt.
  if (res.status === 401) clearToken();
  if (!res.ok) throw new Error(`Drive request failed: ${res.status}${await detail(res)}`);
  return res;
}

// Escape a value for use inside a Drive query string literal (the q= parameter, e.g. name='...').
// Per the Drive API you backslash-escape a backslash and a single quote. The interpolated names today
// are app constants / dates, but escaping keeps the query injection-safe if a name ever becomes
// user-controlled (a stray ' would otherwise break out and alter which files are listed or deleted).
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function readId(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string') {
    return body.id;
  }
  throw new Error('Drive response missing id');
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function readFiles(body: unknown): DriveFile[] {
  if (typeof body !== 'object' || body === null || !('files' in body)) return [];
  const files = body.files;
  if (!isUnknownArray(files)) return [];
  const out: DriveFile[] = [];
  for (const f of files) {
    if (
      typeof f === 'object' &&
      f !== null &&
      'id' in f &&
      'name' in f &&
      typeof f.id === 'string' &&
      typeof f.name === 'string'
    ) {
      out.push({ id: f.id, name: f.name });
    }
  }
  return out;
}

export async function findOrCreateFolder(token: string, name: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${escapeQuery(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  const listed = await driveFetch(token, `${API}/files?q=${q}&spaces=drive&fields=files(id,name)`, {
    method: 'GET',
  });
  const existing = readFiles(await listed.json());
  if (existing.length > 0 && existing[0] !== undefined) return existing[0].id;

  const created = await driveFetch(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  });
  return readId(await created.json());
}

export async function listBackups(token: string, folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch(
    token,
    `${API}/files?q=${q}&orderBy=name desc&fields=files(id,name)`,
    { method: 'GET' },
  );
  return readFiles(await res.json());
}

export async function uploadBackup(
  token: string,
  folderId: string,
  name: string,
  text: string,
): Promise<void> {
  // One file per day: if today's file exists, replace its media; otherwise create a new one.
  const q = encodeURIComponent(
    `name='${escapeQuery(name)}' and '${folderId}' in parents and trashed=false`,
  );
  const found = await driveFetch(token, `${API}/files?q=${q}&fields=files(id,name)`, {
    method: 'GET',
  });
  const existing = readFiles(await found.json());

  if (existing.length > 0 && existing[0] !== undefined) {
    await driveFetch(token, `${UPLOAD}/files/${existing[0].id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    });
    return;
  }

  const boundary = 'moniflow-boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [folderId] }) +
    `\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n` +
    text +
    `\r\n--${boundary}--`;
  await driveFetch(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export async function downloadFile(token: string, fileId: string): Promise<string> {
  const res = await driveFetch(token, `${API}/files/${fileId}?alt=media`, { method: 'GET' });
  return res.text();
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await driveFetch(token, `${API}/files/${fileId}`, { method: 'DELETE' });
}
