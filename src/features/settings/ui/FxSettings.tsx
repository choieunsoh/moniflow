'use client';

import { setCardFeePctAction, refreshFxRatesAction } from '../actions';

// Card FX fee % + a manual "Refresh FX rates" button. Two independent forms so each posts on its own.
// `rates` is the code→asOf-date map for the "as of" line; empty means never fetched.
export function FxSettings({
  cardFeePct,
  ratesAsOf,
}: {
  cardFeePct: number;
  ratesAsOf: Record<string, string>;
}) {
  const dates = Object.values(ratesAsOf).sort();
  const asOf = dates.length > 0 ? dates[dates.length - 1] : null;
  const count = Object.keys(ratesAsOf).length;

  return (
    <div className="flex flex-col gap-4">
      <form action={setCardFeePctAction} className="flex flex-col gap-3">
        <label htmlFor="pct" className="text-sm font-medium">
          Card FX fee %
        </label>
        <input
          id="pct"
          name="pct"
          type="number"
          min={0}
          max={10}
          step={0.1}
          inputMode="decimal"
          defaultValue={cardFeePct}
          required
          className="min-h-11 w-24 rounded-[var(--radius-sm)] border px-3 py-2 text-base"
          style={{ borderColor: 'var(--color-border)' }}
        />
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Your card&apos;s foreign-transaction markup, added on top of the Visa rate so a non-THB
          entry&apos;s stored baht matches your statement.
        </p>
        <button type="submit" className="btn btn-primary w-fit">
          Save
        </button>
      </form>

      <form action={refreshFxRatesAction} className="flex flex-col gap-2">
        <button type="submit" className="btn btn-primary w-fit">
          Refresh FX rates
        </button>
        <p className="tnum text-xs" style={{ color: 'var(--color-faint)' }}>
          {asOf === null
            ? 'No rates cached yet — tap to fetch the latest Visa rates.'
            : `Visa rates for ${count} ${count === 1 ? 'currency' : 'currencies'}, as of ${asOf}.`}
        </p>
      </form>
    </div>
  );
}
