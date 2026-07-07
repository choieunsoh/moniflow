// Reads the local SQLite DB per request for the datalists, so opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getDistinctAccounts, getDistinctCategories } from '@features/entries/queries';
import { addEntryAction } from '@features/entries/actions';
import { EntryForm } from '@features/entries/ui/EntryForm';

export default function NewEntryPage() {
  const db = initDb();
  ensureEntriesTable(db);
  const accounts = getDistinctAccounts(db);
  const categories = getDistinctCategories(db);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Add entry</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Record a new inflow or outflow.
        </p>
      </header>
      <EntryForm action={addEntryAction} accounts={accounts} categories={categories} />
    </div>
  );
}
