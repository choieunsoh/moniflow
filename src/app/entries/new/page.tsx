// Reads the local SQLite DB per request for the datalists, so opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getDistinctAccounts, getDistinctCategories } from '@features/entries/queries';
import { addEntryAction } from '@features/entries/actions';
import { EntryForm } from '@features/entries/ui/EntryForm';
import { PageContainer } from '@shared/ui/PageContainer';

export default function NewEntryPage() {
  const db = initDb();
  ensureEntriesTable(db);
  const accounts = getDistinctAccounts(db);
  const categories = getDistinctCategories(db);

  return (
    <PageContainer size="form">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Add entry</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Record a new inflow or outflow.
        </p>
      </header>
      <EntryForm action={addEntryAction} accounts={accounts} categories={categories} />
    </PageContainer>
  );
}
