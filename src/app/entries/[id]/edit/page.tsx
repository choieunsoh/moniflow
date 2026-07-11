// Reads the local SQLite DB per request, so opt out of static generation.
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getAccountsByUsage,
  getCategoryCounts,
  getDistinctAccounts,
  getDistinctCategories,
  getEntryById,
} from '@features/entries/queries';
import { ensureCategoriesTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor, getHueMap, hueFor } from '@features/categories/queries';
import { ensureSettingsTable } from '@features/settings/schema';
import { getIconSet } from '@features/settings/queries';
import { editEntryAction } from '@features/entries/actions';
import { EntryForm } from '@features/entries/ui/EntryForm';
import { Keypad } from '@features/entries/ui/Keypad';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = initDb();
  ensureEntriesTable(db);
  const entry = getEntryById(db, Number(id));
  if (!entry) {
    notFound();
  }

  // The keypad UI only represents THB expenses; income / foreign-currency rows keep the full form
  // until the keypad grows currency + direction support.
  const keypadEditable = entry.amount < 0 && (entry.currency === null || entry.currency === 'THB');

  if (keypadEditable) {
    ensureCategoriesTable(db);
    ensureSettingsTable(db);
    const emojiMap = getEmojiMap(db);
    const hueMap = getHueMap(db);
    const iconSet = getIconSet(db);
    const categories = getCategoryCounts(db).map((c) => ({
      name: c.category,
      emoji: emojiFor(emojiMap, c.category),
      hue: hueFor(hueMap, c.category),
    }));
    const accounts = getAccountsByUsage(db);

    return (
      <PageContainer size="full">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Edit expense</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Adjust the amount, then tap a category to save.
          </p>
        </header>
        <Keypad
          categories={categories}
          accounts={accounts}
          defaultAccount={entry.account}
          today={todayIso()}
          iconSet={iconSet}
          action={editEntryAction}
          entry={entry}
        />
      </PageContainer>
    );
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
