'use client';

import { useState, useTransition } from 'react';
import { formatBaht, formatCurrency } from '@shared/money';
import { formatDayHeading } from '@shared/date';
import { addEntryAction } from '../actions';
import { evaluate } from '../calc';
import { toThb } from '../fx';
import { isCurrency } from '../entry-form';
import type { Currency } from '../entry-form';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { AccountIcon } from '@features/accounts/ui/AccountIcon';
import { refreshFxRatesAction } from '@features/settings/actions';
import type { IconSet } from '@features/settings/queries';
import type { EntryRow } from '../schema';

export type KeypadCategory = { name: string; emoji: string; hue?: number };
export type KeypadAccount = { name: string; icon: string; hue?: number };
export type KeypadCurrency = { code: Currency; symbol: string };

const OPS = '+−×÷';
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+'];

// The editable FX rate is shown to 4 decimals (enough for every supported currency; the smallest,
// KRW, is ~0.023 THB per unit). useGrouping off so the value stays a valid <input type=number>.
const rateFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4, useGrouping: false });
function formatRate(rate: number): string {
  return rateFmt.format(rate);
}

const pillClass =
  'tap shrink-0 justify-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors';

function chipStyle(selected: boolean): React.CSSProperties {
  return selected
    ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' }
    : {
        background: 'var(--color-surface-2)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      };
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${pillClass} active:opacity-70`}
      style={chipStyle(selected)}
    >
      {children}
    </button>
  );
}

// Advance the amount expression by one key press, with light guards (no leading operator, no double
// operator, one decimal point per number). Arithmetic itself is evaluated by ../calc.
function nextExpr(prev: string, key: string): string {
  if (key === '⌫') return prev.slice(0, -1);
  const last = prev.slice(-1);
  if (OPS.includes(key)) {
    if (prev === '') return prev;
    return OPS.includes(last) ? prev.slice(0, -1) + key : prev + key;
  }
  if (key === '.') {
    const segment = prev.split(/[+−×÷]/).pop() ?? '';
    if (segment.includes('.')) return prev;
    return prev === '' || OPS.includes(last) ? prev + '0.' : prev + '.';
  }
  return prev + key; // digit
}

// Monefy-style expense entry: a calculator keypad for the amount, then a category grid that submits.
// Four views (keypad / account / currency / category) toggle via `hidden` inside one always-mounted
// <form>. The amount you key in is in the selected `currency`; for a non-THB currency the THB value
// posted (hidden `thb`) is the foreign amount × the effective (fee-inclusive) rate. Reused for the
// new-entry route and for editing an expense (THB or foreign) — pass `entry` + editEntryAction.
export function Keypad({
  categories,
  accounts,
  currencies,
  rates,
  ratesAsOf,
  defaultAccount,
  today,
  iconSet,
  action = addEntryAction,
  entry,
}: {
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  currencies: KeypadCurrency[];
  rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
  ratesAsOf: Record<string, string>;
  defaultAccount: string;
  today: string;
  iconSet: IconSet;
  action?: (formData: FormData) => Promise<void>;
  entry?: EntryRow;
}) {
  const initialCurrency: Currency =
    entry && entry.currency !== null && isCurrency(entry.currency) ? entry.currency : 'THB';
  const initialForeign = entry
    ? String(
        Math.abs(
          initialCurrency !== 'THB' && entry.originalAmount !== null
            ? entry.originalAmount
            : entry.amount,
        ),
      )
    : '';
  // Preserve an edited foreign row's own rate: its stored effective rate = |THB| / |foreign|.
  const initialOverride =
    entry && initialCurrency !== 'THB' && entry.originalAmount
      ? formatRate(Math.abs(entry.amount) / Math.abs(entry.originalAmount))
      : '';

  const [expr, setExpr] = useState(initialForeign);
  const [view, setView] = useState<'keypad' | 'account' | 'currency' | 'category'>('keypad');
  const [date, setDate] = useState(entry?.date ?? today);
  const [account, setAccount] = useState(entry?.account ?? defaultAccount);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [rateOverride, setRateOverride] = useState(initialOverride);
  const [isRefreshing, startRefresh] = useTransition();

  const isCustomDate = date !== today;
  const amount = evaluate(expr); // the FOREIGN figure keyed in
  const validAmount = amount !== null && amount > 0;
  const isThb = currency === 'THB';
  const symbol = currencies.find((c) => c.code === currency)?.symbol ?? currency;

  const overrideNum = rateOverride.trim() === '' ? null : Number(rateOverride);
  const effectiveRate =
    overrideNum !== null && Number.isFinite(overrideNum) && overrideNum > 0
      ? overrideNum
      : (rates[currency] ?? null);
  const hasRate = isThb || (effectiveRate !== null && effectiveRate > 0);
  const thbValue = amount === null ? 0 : isThb ? amount : toThb(amount, effectiveRate ?? 0);
  const canSubmit = validAmount && hasRate && (isThb || thbValue > 0);
  const spaced = expr.replace(/([+−×÷])/g, ' $1 ').trim();

  return (
    <form action={action} className="flex flex-col gap-4">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      {entry ? <input type="hidden" name="time" value={entry.time ?? ''} /> : null}
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="direction" value="expense" />
      <input type="hidden" name="amount" value={validAmount ? String(amount) : ''} />
      <input type="hidden" name="thb" value={canSubmit ? String(thbValue) : ''} />
      <input type="hidden" name="account" value={account} />

      {/* Amount + inputs + keypad */}
      <div className={view === 'keypad' ? 'flex flex-col gap-4' : 'hidden'}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip selected={date === today} onClick={() => setDate(today)}>
            Today
          </Chip>
          <span className="relative inline-flex shrink-0">
            <span className={pillClass} style={chipStyle(isCustomDate)}>
              {isCustomDate ? formatDayHeading(date) : 'Earlier…'}
            </span>
            <input
              type="date"
              name="date"
              value={date}
              max={today}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v <= today) setDate(v);
              }}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker();
                } catch {
                  // no-op: browser without showPicker, or a picker already open
                }
              }}
              aria-label="Pick another date"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>

          {/* Currency chip → opens the currency grid. */}
          <button
            type="button"
            onClick={() => setView('currency')}
            aria-haspopup="true"
            aria-label={`Currency: ${currency}`}
            className="tap ml-auto shrink-0 justify-center gap-1.5 rounded-full px-4 text-sm font-medium active:opacity-70"
            style={chipStyle(!isThb)}
          >
            <span className="tnum">
              {symbol} {currency}
            </span>
            <span aria-hidden>▾</span>
          </button>

          {/* Account chip → opens the account grid. */}
          <button
            type="button"
            onClick={() => setView('account')}
            aria-haspopup="true"
            aria-label={`Account: ${account}`}
            className="tap max-w-full shrink-0 justify-center gap-1.5 rounded-full px-4 text-sm font-medium active:opacity-70"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          >
            <span className="truncate">{account}</span>
            <span aria-hidden>▾</span>
          </button>
        </div>

        <div className="panel flex flex-col items-end gap-1 px-5 py-4">
          <span className="tnum text-sm" style={{ color: 'var(--color-faint)' }}>
            {spaced || ' '}
          </span>
          <span
            className="tnum text-4xl font-semibold"
            style={{ color: validAmount ? 'var(--color-text)' : 'var(--color-faint)' }}
          >
            {isThb ? formatBaht(amount ?? 0) : formatCurrency(amount ?? 0, currency)}
          </span>

          {/* Rate line — only for a non-THB currency. Rate is editable (per-entry override, shown to
              4 dp); blank falls back to the cached effective rate. The ↻ button refreshes the ECB
              rates in place; the "as of" date shows how fresh the cached rate is. */}
          {!isThb ? (
            <div className="mt-1 flex w-full flex-col items-end gap-1 text-sm">
              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                <span style={{ color: 'var(--color-muted)' }} className="tnum">
                  1 {currency} =
                </span>
                <input
                  name="rate-display"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={rateOverride}
                  onChange={(e) => setRateOverride(e.target.value)}
                  placeholder={rates[currency] !== undefined ? formatRate(rates[currency]) : 'rate'}
                  aria-label={`THB per 1 ${currency}`}
                  className="tnum h-9 w-24 rounded-[var(--radius-sm)] border px-2 text-right text-sm"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                />
                <span style={{ color: 'var(--color-muted)' }} className="tnum">
                  THB
                </span>
                <span
                  className="tnum font-semibold"
                  style={{ color: hasRate ? 'var(--color-text)' : 'var(--color-faint)' }}
                >
                  {hasRate ? `≈ ${formatBaht(thbValue)}` : 'no rate'}
                </span>
              </div>
              <div
                className="flex items-center gap-2 text-xs"
                style={{ color: 'var(--color-faint)' }}
              >
                <span className="tnum">
                  {ratesAsOf[currency] !== undefined
                    ? `ECB as of ${ratesAsOf[currency]}`
                    : 'no rate cached'}
                </span>
                <button
                  type="button"
                  onClick={() => startRefresh(async () => refreshFxRatesAction())}
                  disabled={isRefreshing}
                  aria-label="Refresh FX rates"
                  className="tap justify-center rounded-full px-2 disabled:opacity-40"
                  style={{ color: 'var(--color-accent-text)' }}
                >
                  <span
                    aria-hidden
                    className={isRefreshing ? 'inline-block animate-spin' : undefined}
                  >
                    ↻
                  </span>
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {!isThb && !hasRate ? (
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            No {currency} rate cached. Tap ↻ above to fetch the latest ECB rates, or type a rate.
          </p>
        ) : null}

        <input
          name="note"
          placeholder="Note (optional)"
          defaultValue={entry?.note ?? ''}
          className="h-11 w-full rounded-[var(--radius-sm)] border px-3 text-base"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
        />

        <div className="grid grid-cols-4 gap-2">
          {KEYS.map((key) => {
            const isOp = OPS.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setExpr((p) => nextExpr(p, key))}
                aria-label={key === '⌫' ? 'Backspace' : key}
                className="tnum h-14 rounded-[var(--radius-md)] text-xl font-medium transition-colors active:opacity-70"
                style={{
                  background: isOp ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
                  color: isOp ? 'var(--color-accent-text)' : 'var(--color-text)',
                }}
              >
                {key}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setView('category')}
          disabled={!canSubmit}
          className="btn btn-primary w-full disabled:opacity-40"
        >
          Choose category
        </button>
      </div>

      {/* Currency picker — a grid of every currency (most-used first, THB pinned). Sets state and
          returns; does not submit. */}
      <div className={view === 'currency' ? 'flex flex-col gap-3' : 'hidden'}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView('keypad')}
            className="tap text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            ‹ Back
          </button>
          <span className="text-sm font-semibold">Currency</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {currencies.map((c) => {
            const on = currency === c.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  setCurrency(c.code);
                  setRateOverride(''); // drop any prior override; fall back to the cached rate
                  setView('keypad');
                }}
                aria-pressed={on}
                className="tnum flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border px-2 text-center text-sm font-medium transition-colors active:opacity-70"
                style={
                  on
                    ? {
                        background: 'var(--color-accent)',
                        color: 'var(--color-on-accent)',
                        borderColor: 'var(--color-accent)',
                      }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-text)' }
                }
              >
                <span className="text-2xl">{c.symbol}</span>
                <span>{c.code}</span>
                {ratesAsOf[c.code] !== undefined ? (
                  <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
                    {ratesAsOf[c.code]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Account picker */}
      <div className={view === 'account' ? 'flex flex-col gap-3' : 'hidden'}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView('keypad')}
            className="tap text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            ‹ Back
          </button>
          <span className="text-sm font-semibold">Account</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {accounts.map((a) => {
            const on = account === a.name;
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => {
                  setAccount(a.name);
                  setView('keypad');
                }}
                aria-pressed={on}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border px-2 text-center text-xs font-medium transition-colors active:opacity-70"
                style={
                  on
                    ? {
                        background: 'var(--color-accent)',
                        color: 'var(--color-on-accent)',
                        borderColor: 'var(--color-accent)',
                      }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-text)' }
                }
              >
                <AccountIcon icon={a.icon} name={a.name} size="lg" hue={a.hue} />
                <span className="line-clamp-3 w-full">{a.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category grid — each tile submits the expense with its category. */}
      <div className={view === 'category' ? 'flex flex-col gap-3' : 'hidden'}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView('keypad')}
            className="tap text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            ‹ Back
          </button>
          <span className="tnum text-sm font-semibold">{formatBaht(thbValue)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((c) => (
            <button
              key={c.name}
              type="submit"
              name="category"
              value={c.name}
              className="panel flex flex-col items-center gap-1 px-2 py-3 text-center transition-shadow active:opacity-70"
              style={
                entry?.category === c.name
                  ? {
                      borderColor: 'var(--color-accent)',
                      boxShadow: 'inset 0 0 0 1px var(--color-accent)',
                    }
                  : undefined
              }
            >
              <CategoryIcon emoji={c.emoji} name={c.name} size="lg" iconSet={iconSet} hue={c.hue} />
              <span className="w-full truncate text-xs" style={{ color: 'var(--color-muted)' }}>
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
