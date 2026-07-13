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
import {
  getKeypadCategories,
  getKeypadAccounts,
  getKeypadCurrencies,
} from '@features/entries/keypad-lists';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { getIconSet, getCardFeePct, getFxRates } from '@features/settings/queries';
import { withFee } from '@features/entries/fx';
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

  // The keypad now handles foreign-currency expenses too; only income stays on the full form.
  const keypadEditable = entry.amount < 0;

  if (keypadEditable) {
    ensureCategoriesTable(db);
    ensureAccountsTable(db);
    ensureSettingsTable(db);
    const iconSet = getIconSet(db);
    const categories = getKeypadCategories(db);
    const accounts = getKeypadAccounts(db);
    const currencies = getKeypadCurrencies(db);
    const cardFeePct = getCardFeePct(db);
    const fxRates = getFxRates(db);
    const rates: Record<string, number> = {};
    const ratesAsOf: Record<string, string> = {};
    for (const [code, e] of Object.entries(fxRates)) {
      rates[code] = withFee(e.thbPerUnit, cardFeePct);
      ratesAsOf[code] = e.asOf;
    }

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
          currencies={currencies}
          rates={rates}
          ratesAsOf={ratesAsOf}
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
