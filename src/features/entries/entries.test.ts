import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { addEntries, getEntries, getNetFlow } from './queries';

// Proves the feature is wired end-to-end through its public API: connection → table bootstrap →
// insert → typed read → signed net. Also exercises the @db/client path alias at runtime.
describe('entries feature (in-memory)', () => {
  it('round-trips signed money-flow entries and nets them', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'cash', category: 'salary', amount: 50000 },
      { date: '2026-07-02', account: 'cash', category: 'rent', amount: -12000 },
    ]);

    expect(getEntries(db)).toHaveLength(2);
    expect(getNetFlow(db)).toBe(38000);
  });
});
