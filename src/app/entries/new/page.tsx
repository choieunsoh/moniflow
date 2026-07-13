// Reads the local SQLite DB per request for the category/account lists, so opt out of static gen.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getLatestAccount } from '@features/entries/queries';
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
import { Keypad } from '@features/entries/ui/Keypad';
import { CloseButton } from '@features/entries/ui/CloseButton';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';

export default function NewEntryPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  ensureAccountsTable(db);
  ensureSettingsTable(db);

  const iconSet = getIconSet(db);
  // Tiles in the user's manual keypad order (count/usage order for anything not yet dragged).
  const categories = getKeypadCategories(db);
  const accounts = getKeypadAccounts(db);
  const currencies = getKeypadCurrencies(db);
  const cardFeePct = getCardFeePct(db);
  const fxRates = getFxRates(db);
  const rates: Record<string, number> = {};
  const ratesAsOf: Record<string, string> = {};
  for (const [code, e] of Object.entries(fxRates)) {
    rates[code] = withFee(e.thbPerUnit, cardFeePct); // effective, fee-inclusive
    ratesAsOf[code] = e.asOf;
  }
  // Default to the account last used so the common case (same account again) is zero taps.
  const latestAccount = getLatestAccount(db) ?? accounts[0]?.name ?? '';

  return (
    <PageContainer size="full">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Add expense</h1>
          <p className="text-sm" style={{ color: 'var(--color-faint)' }}>
            Keypad does math (＋ − × ÷) — tap a category to save.
          </p>
        </div>
        <CloseButton />
      </header>
      <Keypad
        categories={categories}
        accounts={accounts}
        currencies={currencies}
        rates={rates}
        ratesAsOf={ratesAsOf}
        defaultAccount={latestAccount}
        today={todayIso()}
        iconSet={iconSet}
      />
    </PageContainer>
  );
}
