'use client';

import { useCurrencies } from '@features/currencies/use-currencies';
import {
  addCurrencyAction,
  setCurrencyOffBudgetAction,
  setCurrencyArchivedAction,
} from '@features/currencies/actions';
import { withSaveToast } from '@shared/ui/with-save-toast';
import { PageContainer } from '@shared/ui/PageContainer';

const rateFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const countFmt = new Intl.NumberFormat('en-US');

// The currency catalog: which codes the keypad offers, their cached ECB rate, and the off-budget /
// archived flags. Loads client-side via useCurrencies against the browser OPFS db; every write here
// (toggle, hide/restore, add) bumps the data version, which refetches this list and re-derives the
// keypad's own picker.
export default function CurrencyPage() {
  const { ready, data } = useCurrencies();

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

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Currencies</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Which currencies the keypad offers, and which of them mean you are travelling.
        </p>
      </header>

      <section className="panel overflow-hidden">
        <ul className="flex flex-col divide-y">
          {data.rows.map((row) => (
            <li key={row.code} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col">
                <span className="font-medium">
                  {row.symbol} {row.code}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {row.thbPerUnit === null
                    ? 'no cached rate'
                    : `฿${rateFmt.format(row.thbPerUnit)} · ${row.asOf ?? ''}`}
                  {row.entryCount > 0 ? ` · ${countFmt.format(row.entryCount)} entries` : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <label
                  className="tap flex items-center gap-1.5 text-xs whitespace-nowrap"
                  style={{ color: 'var(--color-muted)' }}
                  title="Off-budget: spending in this currency won't count toward budgets or pace"
                >
                  <input
                    type="checkbox"
                    checked={row.offBudget}
                    onChange={(e) =>
                      void withSaveToast(setCurrencyOffBudgetAction, 'Currency updated')(
                        row.code,
                        e.currentTarget.checked,
                      )
                    }
                    aria-label={`Off-budget: exclude ${row.code} from budget meters and pace`}
                  />
                  Off-budget
                </label>
                <button
                  type="button"
                  className="btn btn-ghost tap text-xs"
                  onClick={() =>
                    void withSaveToast(
                      setCurrencyArchivedAction,
                      row.archived ? 'Currency restored' : 'Currency hidden',
                    )(row.code, !row.archived)
                  }
                >
                  {row.archived ? 'Restore' : 'Hide'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold">Add a currency</h2>
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Spending in an off-budget currency is travel, and is left out of budget meters. Currencies
          you only use for online purchases should stay on budget.
        </p>
        <select
          className="min-h-11 w-full max-w-xs rounded-[var(--radius-sm)] border px-3 py-2 text-base"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value === '') return;
            void withSaveToast(addCurrencyAction, 'Currency added')(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="" disabled>
            Choose a code…
          </option>
          {data.addable.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </section>
    </PageContainer>
  );
}
