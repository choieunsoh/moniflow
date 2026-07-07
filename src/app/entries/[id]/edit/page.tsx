// Reads the local SQLite DB per request, so opt out of static generation.
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getDistinctAccounts,
  getDistinctCategories,
  getEntryById,
} from '@features/entries/queries';
import { editEntryAction } from '@features/entries/actions';
import { EntryForm } from '@features/entries/ui/EntryForm';
import { PageContainer } from '@shared/ui/PageContainer';

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = initDb();
  ensureEntriesTable(db);
  const entry = getEntryById(db, Number(id));
  if (!entry) {
    notFound();
  }
  const accounts = getDistinctAccounts(db);
  const categories = getDistinctCategories(db);

  return (
    <PageContainer size="form">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Edit entry</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Update this ledger row.
        </p>
      </header>
      <EntryForm
        action={editEntryAction}
        accounts={accounts}
        categories={categories}
        entry={entry}
      />
    </PageContainer>
  );
}
