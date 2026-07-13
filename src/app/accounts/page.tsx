// Reads the local SQLite DB per request — better-sqlite3 can't be prerendered, and the account list +
// breakdown must reflect the latest import/merge/icon.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getAccountCounts, getAccountBreakdown } from '@features/entries/queries';
import { ensureAccountsTable } from '@features/accounts/schema';
import {
  getAccountIconMap,
  iconForAccount,
  getAccountHueMap,
  hueForAccount,
} from '@features/accounts/queries';
import { AccountIconPicker } from '@features/accounts/ui/AccountIconPicker';
import { AccountNameEditor } from '@features/accounts/ui/AccountNameEditor';
import { AddAccount } from '@features/accounts/ui/AddAccount';
import { DeleteAccountButton } from '@features/accounts/ui/DeleteAccountButton';
import { AccountMergeButton } from '@features/accounts/ui/AccountMergeButton';
import { AccountReorderButton } from '@features/accounts/ui/AccountReorderButton';
import { getKeypadAccounts } from '@features/entries/keypad-lists';
import { DonutChart } from '@features/entries/ui/DonutChart';
import { toBars } from '@features/entries/breakdown';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';
import { formatBaht } from '@shared/money';

const countFmt = new Intl.NumberFormat('en-US');

export default function AccountsPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  ensureSettingsTable(db);

  const counts = getAccountCounts(db);
  const iconMap = getAccountIconMap(db);
  const hueMap = getAccountHueMap(db);

  // Current cycle range, derived exactly like the home page (getCutoff → currentCycleKey → cycleFromKey).
  const cutoff = getCutoff(db);
  const cycle = cycleFromKey(currentCycleKey(todayIso(), cutoff), cutoff);
  const breakdown = getAccountBreakdown(db, cycle.start, cycle.end);
  const bars = toBars(breakdown);
  const names = counts.map((c) => c.account);

  return (
    <PageContainer size="full">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            This cycle&apos;s spending per account. Tap an icon to restyle it, the name to rename
            (type an existing name to merge). An unused account can be deleted; a used one can be
            merged &amp; removed.
          </p>
        </div>
        {/* Seeded from the keypad's own list so the sheet shows (and edits) the manual keypad order,
            not the usage-desc order of the list below. */}
        {counts.length > 1 && <AccountReorderButton items={getKeypadAccounts(db)} />}
      </header>

      {breakdown.length > 0 && (
        <section className="panel flex flex-col gap-3 p-4">
          <DonutChart rows={breakdown} label="Spending by account" />
          <ul className="flex flex-col gap-2">
            {bars.map((b) => (
              <li key={b.key} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{b.key}</span>
                <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                  {formatBaht(Math.abs(b.total))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel overflow-hidden">
        {counts.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--color-muted)' }}>
            No accounts yet — add one below, or import some entries.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {counts.map((c) => (
              <li key={c.account} className="flex items-center gap-3 px-4 py-3">
                <AccountIconPicker
                  account={c.account}
                  current={iconForAccount(iconMap, c.account)}
                  hue={hueForAccount(hueMap, c.account)}
                />
                <AccountNameEditor account={c.account} />
                <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                  {countFmt.format(c.count)}
                </span>
                {c.count === 0 ? (
                  <DeleteAccountButton account={c.account} />
                ) : (
                  <AccountMergeButton
                    account={c.account}
                    others={names.filter((n) => n !== c.account)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <datalist id="account-options">
        {counts.map((c) => (
          <option key={c.account} value={c.account} />
        ))}
      </datalist>

      {/* Sticky compose bar — mirrors the categories page. */}
      <div
        className="sticky mt-0"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))', zIndex: 'var(--z-header)' }}
      >
        <div
          className="flex items-center rounded-[var(--radius-lg)] border p-2 backdrop-blur-md"
          style={{
            background: 'color-mix(in oklab, var(--color-surface-2) 92%, transparent)',
            borderColor: 'var(--color-border-strong)',
            boxShadow: 'var(--shadow-2)',
          }}
        >
          <AddAccount names={names} />
        </div>
      </div>
    </PageContainer>
  );
}
