import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findOrCreateFolder, uploadBackup, listBackups } from './drive-api';

function mockFetchOnce(json: unknown, ok = true): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(json), { status: ok ? 200 : 500 }),
  );
}

describe('drive-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns an existing folder id without creating one', async () => {
    mockFetchOnce({ files: [{ id: 'fold1', name: 'Moniflow Backups' }] });
    expect(await findOrCreateFolder('tok', 'Moniflow Backups')).toBe('fold1');
    expect(fetch).toHaveBeenCalledTimes(1); // list only, no create
  });

  it('creates a folder when none exists', async () => {
    mockFetchOnce({ files: [] }); // list → empty
    mockFetchOnce({ id: 'newfold' }); // create → id
    expect(await findOrCreateFolder('tok', 'Moniflow Backups')).toBe('newfold');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('lists backups as {id,name}', async () => {
    mockFetchOnce({ files: [{ id: 'a', name: 'moniflow-backup-2026-07-22.txt' }] });
    expect(await listBackups('tok', 'fold1')).toEqual([
      { id: 'a', name: 'moniflow-backup-2026-07-22.txt' },
    ]);
  });

  it("escapes a single quote in a name so it can't break out of the Drive query", async () => {
    mockFetchOnce({ files: [] }); // list → empty
    mockFetchOnce({ id: 'f' }); // create
    await findOrCreateFolder('tok', "Bob's Backups");
    const arg = vi.mocked(fetch).mock.calls[0]?.[0];
    const listUrl = decodeURIComponent(typeof arg === 'string' ? arg : '');
    expect(listUrl).toContain("name='Bob\\'s Backups'"); // the ' is backslash-escaped, not raw
  });

  it('updates in place when a file with the same name exists (one-per-day)', async () => {
    mockFetchOnce({ files: [{ id: 'existing', name: 'moniflow-backup-2026-07-22.txt' }] }); // find by name
    mockFetchOnce({ id: 'existing' }); // PATCH media
    await uploadBackup('tok', 'fold1', 'moniflow-backup-2026-07-22.txt', '{"v":3}');
    const calls = vi.mocked(fetch).mock.calls;
    const secondCallUrl = calls[1]?.[0];
    expect(typeof secondCallUrl === 'string' ? secondCallUrl : '').toContain('/files/existing');
    expect(String(calls[1]?.[1]?.method)).toBe('PATCH');
  });
});
