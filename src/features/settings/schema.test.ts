import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureSettingsTable, settings } from './schema';

describe('ensureSettingsTable', () => {
  it('creates a key/value table a row can be inserted into and read back', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    db.insert(settings).values({ key: 'cutoff_day', value: '18' }).run();
    const [row] = db.select().from(settings).all();
    expect(row).toEqual({ key: 'cutoff_day', value: '18' });
  });
});
