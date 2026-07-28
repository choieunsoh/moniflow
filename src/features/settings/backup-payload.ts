import type { Db } from '@db/client';
import { getEntries } from '@features/entries/queries';
import { serializeMonefyCsv } from '@features/entries/import';
import { getCategoryCatalog } from '@features/categories/queries';
import { getAccountCatalog } from '@features/accounts/queries';
import { getRuleCatalog } from '@features/recurring/queries';
import { getBudgetCatalog } from '@features/budgets/queries';
import { getCurrencyCatalog } from '@features/currencies/queries';
import { getAllSettings } from './queries';
import { serializeCatalogJson } from './catalog';

// The one place that assembles moniflow's combined (v3) backup text. Both the share-sheet export
// (use-backup-data) and the Drive push read it, so they serialize identically.
export type BackupPayload = {
  text: string;
  entryCount: number;
  categoryCount: number;
  accountCount: number;
  budgetCount: number;
};

export async function buildBackupText(db: Db): Promise<BackupPayload> {
  const [rows, categories, accounts, recurrences, budgets, settings, currencyRows] =
    await Promise.all([
      getEntries(db),
      getCategoryCatalog(db),
      getAccountCatalog(db),
      getRuleCatalog(db),
      getBudgetCatalog(db),
      getAllSettings(db),
      getCurrencyCatalog(db),
    ]);
  const text = serializeCatalogJson({
    version: 4,
    categories,
    accounts,
    recurrences,
    entriesCsv: serializeMonefyCsv(rows),
    budgets,
    settings,
    currencies: currencyRows,
  });
  return {
    text,
    entryCount: rows.length,
    categoryCount: categories.length,
    accountCount: accounts.length,
    budgetCount: budgets.length,
  };
}
