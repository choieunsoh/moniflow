import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { makeNodeProxyDb } from '@db/client';
import { withDb } from './db-effect';

const okDb = makeNodeProxyDb();

describe('withDb', () => {
  beforeEach(() => {
    vi.mocked(getBrowserDb).mockReset();
  });

  it('runs the effect with the open db', async () => {
    vi.mocked(getBrowserDb).mockResolvedValue(okDb);
    const run = vi.fn().mockResolvedValue(undefined);

    await withDb(run);

    expect(run).toHaveBeenCalledWith(okDb);
  });

  // The whole point of the split. A db that will not open is already reported once, app-wide, by
  // useDbHealth in AppShell — so seventeen read hooks each rejecting about it adds seventeen
  // unhandled rejections and not one piece of new information.
  it('resolves quietly when the db cannot be opened, and never runs the effect', async () => {
    vi.mocked(getBrowserDb).mockRejectedValue(new Error('NoModificationAllowedError'));
    const run = vi.fn();

    await expect(withDb(run)).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  // The other half, and the reason this isn't just a blanket catch: once the db IS open, a throw is
  // a bug in a query, not an environment condition. Swallowing it would strand the hook not-ready
  // and leave the page on a skeleton forever with nothing in the console to explain why.
  it('lets an error from the effect itself propagate', async () => {
    vi.mocked(getBrowserDb).mockResolvedValue(okDb);
    const boom = new Error('no such column: nope');

    await expect(withDb(() => Promise.reject(boom))).rejects.toThrow('no such column: nope');
  });
});
