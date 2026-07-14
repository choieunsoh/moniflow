import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable, settings } from './schema';

describe('ensureSettingsTable', () => {
  it('creates a key/value table a row can be inserted into and read back', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await db.insert(settings).values({ key: 'cutoff_day', value: '18' }).run();
    const [row] = await db.select().from(settings).all();
    expect(row).toEqual({ key: 'cutoff_day', value: '18' });
  });
});
