'use client';

import { useAccountsPage } from '@features/accounts/use-accounts-page';
import { iconForAccount, hueForAccount } from '@features/accounts/queries';
import { refundedAccountBars } from '@features/accounts/ring-footnote';
import { AccountIconPicker } from '@features/accounts/ui/AccountIconPicker';
import { AccountNameEditor } from '@features/accounts/ui/AccountNameEditor';
import { AddAccount } from '@features/accounts/ui/AddAccount';
import { DeleteAccountButton } from '@features/accounts/ui/DeleteAccountButton';
import { AccountMergeButton } from '@features/accounts/ui/AccountMergeButton';
import { AccountReorderButton } from '@features/accounts/ui/AccountReorderButton';
import { DonutChart } from '@features/entries/ui/DonutChart';
import { RingFootnote } from '@features/entries/ui/RingFootnote';
import { PageContainer } from '@shared/ui/PageContainer';
import { formatBaht } from '@shared/money';

const countFmt = new Intl.NumberFormat('en-US');

// Accounts list + this cycle's spending breakdown. Loads client-side via useAccountsPage against
// the browser OPFS db; add/rename/delete/merge/reorder actions bump the data-version, which
// refetches this list. Always the current cycle (no ?cycle= param) — mirrors the server version.
export default function AccountsPage() {
  const { ready, data } = useAccountsPage();

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  const { counts, iconMap, hueMap, breakdown, bars, keypadAccounts } = data;
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
        {counts.length > 1 && <AccountReorderButton items={keypadAccounts} />}
      </header>

      {breakdown.length > 0 && (
        <section className="panel flex flex-col gap-3 p-4">
          <DonutChart rows={breakdown} label="Spending by account" />
          <ul className="flex flex-col gap-2">
            {/* An account whose refunds exceed its spend has nothing to show — the donut above
                already drops it (toDonutSlices filters value > 0), so the list must fold at the
                same point or the two disagree about which accounts had spending. */}
            {bars
              .filter((b) => b.pct > 0)
              .map((b) => (
                <li key={b.key} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{b.key}</span>
                  <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                    {/* Same filter logic as Breakdown.tsx: pct > 0 ensures total < 0, so -b.total is always positive. */}
                    {formatBaht(-b.total)}
                  </span>
                </li>
              ))}
          </ul>
          {/* A dropped account has total >= 0 (a net-zero account moved no money and would be
              named for nothing), so the strict total > 0 of refundedAccountBars is what tells a
              genuine refund apart from a coincidental wash, matching Home's own predicate. */}
          <RingFootnote
            refunded={refundedAccountBars(bars).reduce((sum, b) => sum + b.total, 0)}
            categories={refundedAccountBars(bars).map((b) => b.key)}
          />
        </section>
      )}

      <section className="panel overflow-hidden">
        {/* The page heading describes the DONUT above (this cycle's spending). This list is a different
            dataset: every account ever used, ranked by all-time usage. Without its own heading a reader
            carries "spending" down from the top of the page onto a number that counts entries. */}
        <h2 className="px-4 pt-4 text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          All accounts · times used
        </h2>
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
                  {countFmt.format(c.count)} entries
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
