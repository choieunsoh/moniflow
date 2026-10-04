'use client';

import { useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import type { FxRates } from '@features/settings/queries';
import { currencySymbol, formatCurrency } from '@shared/money';
import { formatDayHeadingWithYear } from '@shared/date';
import { Money } from '@shared/ui/Money';
import { convertRows, parseAmount, rateDate } from '../convert';

export type ConverterProps = {
  codes: readonly string[];
  rates: FxRates;
  cardFeePct: number;
  from: string;
  to: string;
  amount: string;
  onAmount: (raw: string) => void;
  onPair: (from: string, to: string) => void;
  onRefresh: () => Promise<void>;
};

const feeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
// Per-1 rates need 4 dp in every currency (฿0.2210 would read ฿0.22 at the currency default).
const perUnitFormatters = new Map<string, Intl.NumberFormat>();
function formatPerUnit(value: number, currency: string): string {
  let fmt = perUnitFormatters.get(currency);
  if (fmt === undefined) {
    fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
    perUnitFormatters.set(currency, fmt);
  }
  return fmt.format(value);
}

const selectClass = 'min-h-11 w-full rounded-[var(--radius-sm)] border px-3 py-2 text-base';
const fieldStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' };

// Controlled view for /convert: the route owns from/to/amount (URL) and the refresh action; this
// only renders. The four fee rows are "what if"; ★ marks the one your card actually charges.
export function Converter(props: ConverterProps) {
  const { codes, rates, cardFeePct, from, to, amount, onAmount, onPair, onRefresh } = props;
  const [refreshing, setRefreshing] = useState(false);
  const value = parseAmount(amount);
  const result = convertRows(value, from, to, rates);
  const asOf = rateDate(from, to, rates);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="panel flex flex-col gap-4 p-5">
      <input
        type="text"
        inputMode="decimal"
        aria-label="Amount"
        placeholder="Amount"
        className={`${selectClass} tnum`}
        style={fieldStyle}
        value={amount}
        onChange={(e) => onAmount(e.currentTarget.value)}
      />

      <div className="flex items-center gap-2">
        <select
          aria-label="From currency"
          className={selectClass}
          style={fieldStyle}
          value={from}
          onChange={(e) => onPair(e.currentTarget.value, to)}
        >
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Swap currencies"
          className="btn btn-ghost tap shrink-0"
          onClick={() => onPair(to, from)}
        >
          <ArrowLeftRight aria-hidden size={18} />
        </button>
        <select
          aria-label="To currency"
          className={selectClass}
          style={fieldStyle}
          value={to}
          onChange={(e) => onPair(from, e.currentTarget.value)}
        >
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div
        className="flex items-center justify-between gap-3 text-xs"
        style={{ color: 'var(--color-muted)' }}
      >
        <span>
          {asOf === null ? 'No cached rate' : `ECB rate · ${formatDayHeadingWithYear(asOf)}`}
        </span>
        <button
          type="button"
          className="btn btn-ghost tap flex items-center gap-1 text-xs"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw aria-hidden size={14} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {result.kind === 'missing' ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No rate for {result.code} yet
        </p>
      ) : (
        <>
          <table className="tnum w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--color-muted)' }}>
                <th className="py-1 text-left font-normal">Fee</th>
                <th className="py-1 text-right font-normal">per {currencySymbol(from)}1</th>
                {value !== null && (
                  <th className="py-1 text-right font-normal">
                    <Money>{formatCurrency(value, from)}</Money>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.feePct} className="border-t">
                  <td className="py-2">
                    +{feeFmt.format(row.feePct)}%
                    {row.feePct === cardFeePct && result.rows.length > 1 && (
                      <span
                        role="img"
                        aria-label="your card fee"
                        title="Your card fee (Settings)"
                        className="ml-1"
                        style={{ color: 'var(--action)' }}
                      >
                        ★
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Money>{formatPerUnit(row.perUnit, to)}</Money>
                  </td>
                  {row.total !== null && (
                    <td className="py-2 text-right font-medium">
                      <Money>{formatCurrency(row.total, to)}</Money>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {result.rows.length === 1 && from !== to && (
            <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
              Mid rate — card fees apply in baht
            </p>
          )}
        </>
      )}
    </section>
  );
}
