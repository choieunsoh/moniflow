'use client';

import { useState } from 'react';
import { formatBaht, formatBahtKeyed, formatCurrency } from '@shared/money';
import { evaluate, nextExpr, OPS } from '@features/entries/calc';
import { toThb } from '@features/entries/fx';
import { isCurrency, type Currency } from '@features/entries/entry-form';
import type { KeypadCategory, KeypadAccount, KeypadCurrency } from '@features/entries/ui/Keypad';
import { CloseButton } from '@features/entries/ui/CloseButton';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { AccountIcon } from '@features/accounts/ui/AccountIcon';
import type { IconSet } from '@features/settings/queries';
import type { Recurrence } from '../schema';
import { ordinal } from '../ordinal';

// Mirrors Keypad's KEYS — the two money-entry surfaces must key identically, and duplicating the
// literal costs less than coupling this to entries/ui/Keypad for a layout constant.
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+'];

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// Month number (1-based) → short name, via Intl (a fixed UTC day in that month, formatted). No
// hand-maintained name table; matches the app's Intl-only date policy.
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const monthLongFmt = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
function monthName(m: number, long = false): string {
  const d = new Date(Date.UTC(2020, m - 1, 1));
  return (long ? monthLongFmt : monthFmt).format(d);
}

// Same 4-dp rate display as the keypad — enough for every supported currency (KRW, the smallest, is
// ~0.023 THB/unit). useGrouping off so the value stays a valid <input type=number>.
const rateFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
  useGrouping: false,
});

function chipStyle(selected: boolean): React.CSSProperties {
  return selected
    ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' }
    : {
        background: 'var(--color-surface-2)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      };
}

// The schedule chip's glyph. Inline SVG in the app's chrome-icon house style (cf. Keypad, BottomBar)
// — stroke inherits the chip's colour.
function RepeatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 7a4 4 0 0 1 4-4h5M13 9a4 4 0 0 1-4 4H4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M10.5 1.5 12.8 3l-2.3 1.5M5.5 14.5 3.2 13l2.3-1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A standing rule is an expense plus a schedule, so it is entered the way an expense is: the Keypad's
// vocabulary, field for field — chip row, amount panel, 4-column key grid, and a category grid whose
// tap IS the save. Four views (keypad / schedule / account / currency / category) toggle via `hidden`
// inside one always-mounted <form>, exactly as Keypad does.
//
// One semantic differs from the keypad and it matters: the FX rate here starts BLANK, not pre-filled
// with the cached rate. A rule's blank rate means "price each post at the live rate on its own due
// date" — pre-filling would silently pin every rule to today's rate forever. The cached rate shows as
// a placeholder and drives the preview, so you still see what it would cost.
export function RuleKeypad({
  categories,
  accounts,
  currencies,
  rates,
  ratesAsOf,
  defaultAccount,
  today,
  iconSet,
  action,
  rule,
  ruleCategory,
  ruleAccount,
}: {
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  currencies: KeypadCurrency[];
  rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
  ratesAsOf: Record<string, string>;
  defaultAccount: string;
  today: string; // YYYY-MM-DD — only its day-of-month is used, to default a new rule's day
  iconSet: IconSet;
  action: (formData: FormData) => Promise<void>;
  rule?: Recurrence;
  ruleCategory?: string;
  ruleAccount?: string;
}) {
  const initialCurrency: Currency =
    rule && rule.currency !== null && isCurrency(rule.currency) ? rule.currency : 'THB';

  const [expr, setExpr] = useState(rule ? String(rule.amount) : '');
  const [view, setView] = useState<'keypad' | 'schedule' | 'account' | 'currency' | 'category'>(
    'keypad',
  );
  const [day, setDay] = useState(rule?.day ?? Number(today.split('-')[2]));
  const [intervalMonths, setIntervalMonths] = useState(rule?.intervalMonths ?? 1);
  // Which month a yearly rule renews in (1–12). Seeded from an edited yearly rule's startDate, else
  // today's month, so switching a monthly rule to yearly starts on a sensible default. Only ever
  // submitted (and only read by the parser) when the cadence is yearly.
  const [month, setMonth] = useState(
    rule?.intervalMonths === 12
      ? Number(rule.startDate.split('-')[1])
      : Number(today.split('-')[1]),
  );
  const [account, setAccount] = useState(ruleAccount ?? defaultAccount);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  // '' = follow the live rate on each due date (the rule default). A typed value pins it.
  const [rateStr, setRateStr] = useState(
    rule?.rate !== null && rule ? rateFmt.format(rule.rate) : '',
  );
  const [totalCount, setTotalCount] = useState(
    rule?.totalCount !== null && rule ? String(rule.totalCount) : '',
  );
  const [startSeq, setStartSeq] = useState(rule ? String(rule.startSeq) : '');
  const [name, setName] = useState(rule?.name ?? '');

  const amount = evaluate(expr);
  const validAmount = amount !== null && amount > 0;
  const isThb = currency === 'THB';
  const isYearly = intervalMonths === 12;
  const symbol = currencies.find((c) => c.code === currency)?.symbol ?? currency;
  const spaced = expr.replace(/([+−×÷])/g, ' $1 ').trim();

  // The rate that PREVIEWS the THB cost: the pinned one if typed, else the cached ECB rate. What the
  // sweep will actually use on a future due date is that day's live rate — the caption says so.
  const pinned = rateStr.trim() === '' ? null : Number(rateStr);
  const cached = rates[currency];
  const previewRate =
    pinned !== null && Number.isFinite(pinned) && pinned > 0 ? pinned : (cached ?? null);
  const thbPreview = amount === null || previewRate === null ? null : toThb(amount, previewRate);
  const canSubmit = validAmount && name.trim() !== '' && account !== '';

  return (
    <form action={action} className="flex flex-col gap-4">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="intervalMonths" value={intervalMonths} />
      {isYearly ? <input type="hidden" name="month" value={month} /> : null}
      <input type="hidden" name="account" value={account} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="amount" value={validAmount ? String(amount) : ''} />
      <input type="hidden" name="rate" value={rateStr.trim()} />
      <input type="hidden" name="totalCount" value={totalCount.trim()} />
      <input type="hidden" name="startSeq" value={startSeq.trim()} />

      {/* Keypad view — the chip row carries the page's chrome (including the close control), which is
          what lets the route drop its title block entirely, exactly as /entries/new does. */}
      <div className={view === 'keypad' ? 'flex flex-col gap-4' : 'hidden'}>
        <div className="flex items-center gap-2">
          {/* One chip for "when": the day and the cadence are one decision, and folding them together
              keeps this row at the keypad's four items on a 412px frame. */}
          <button
            type="button"
            onClick={() => setView('schedule')}
            aria-haspopup="true"
            aria-label={
              isYearly
                ? `Schedule: every ${monthName(month, true)} ${ordinal(day)}`
                : `Schedule: monthly on the ${ordinal(day)}`
            }
            className="tap shrink-0 justify-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors active:opacity-70"
            style={chipStyle(isYearly)}
          >
            <RepeatIcon />
            {/* The chip shows only the day — the accent fill already marks it as yearly, and the month
                is chosen (and stated in full) inside the schedule view. The aria-label above still
                names the month so a screen reader knows it without opening the picker. */}
            <span className="tnum">{ordinal(day)}</span>
          </button>

          <button
            type="button"
            onClick={() => setView('currency')}
            aria-haspopup="true"
            aria-label={`Currency: ${currency}`}
            className="tap ml-auto shrink-0 justify-center gap-1.5 rounded-full px-3 text-sm font-medium active:opacity-70"
            style={chipStyle(!isThb)}
          >
            <span className="tnum">
              {symbol} {currency}
            </span>
            <span aria-hidden>▾</span>
          </button>

          <button
            type="button"
            onClick={() => setView('account')}
            aria-haspopup="true"
            aria-label={`Account: ${account}`}
            className="tap min-w-0 justify-center gap-1.5 rounded-full px-3 text-sm font-medium active:opacity-70"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          >
            <span className="min-w-0 truncate">{account}</span>
            <span aria-hidden className="shrink-0">
              ▾
            </span>
          </button>

          <CloseButton className="-mr-1 ml-1" />
        </div>

        <div className="panel flex flex-col items-end gap-1 px-5 py-4">
          <span className="tnum min-h-5 text-sm" style={{ color: 'var(--color-faint)' }}>
            {spaced}
          </span>
          <span
            className="tnum text-4xl font-semibold"
            style={{ color: validAmount ? 'var(--color-text)' : 'var(--color-faint)' }}
          >
            {isThb ? formatBahtKeyed(amount ?? 0) : formatCurrency(amount ?? 0, currency)}
          </span>

          {/* Rate line — non-THB only. Blank pins nothing: each post prices at the live ECB rate for
              its own due date, which is the whole point of a dated fixing. Type a rate to pin it. */}
          {!isThb ? (
            <div className="mt-1 flex w-full flex-col items-end gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base" style={{ color: 'var(--color-muted)' }}>
                  ≈
                </span>
                <span
                  className="tnum text-[1.75rem] leading-none font-bold"
                  style={{
                    color: thbPreview !== null ? 'var(--color-text)' : 'var(--color-faint)',
                  }}
                >
                  {thbPreview !== null ? formatBaht(thbPreview) : 'no rate'}
                </span>
              </div>

              <div
                className="flex w-full items-center justify-between gap-2 text-xs"
                style={{ color: 'var(--color-faint)' }}
              >
                <span className="tnum inline-flex items-center gap-1.5">
                  1 {currency} =
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={rateStr}
                    onChange={(e) => setRateStr(e.target.value)}
                    placeholder={cached !== undefined ? rateFmt.format(cached) : 'rate'}
                    aria-label={`Pinned THB per 1 ${currency} — leave blank to price each post at that day's live rate`}
                    className="tnum h-8 w-20 rounded-[var(--radius-sm)] border px-2 text-right"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                  />
                  THB
                </span>
                <span className="tnum whitespace-nowrap">
                  {pinned !== null
                    ? 'pinned'
                    : ratesAsOf[currency] !== undefined
                      ? `live · ECB ${ratesAsOf[currency]}`
                      : 'live rate'}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {!isThb ? (
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            {pinned !== null
              ? `Pinned: every post converts at ${rateStr} THB.`
              : "Blank rate: each post converts at that day's live ECB rate."}
          </p>
        ) : null}

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

        {/* The name sits where the keypad's note does — same slot, same order of filling: key the
            amount, name it, then pick the category that saves it. Required here, unlike a note. */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (Netflix, Rent, Fridge…)"
          aria-label="Rule name"
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (!canSubmit) return;
            e.currentTarget.blur();
            setView('category');
          }}
          className="h-11 w-full rounded-[var(--radius-sm)] border px-3 text-base"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
        />

        {/* Installment — blank leaves it an open-ended subscription. Two quiet fields rather than a
            mode toggle: filling them IS the mode, and an empty pair reads as "no end", which is true. */}
        <div
          className="flex items-center justify-end gap-2 text-xs"
          style={{ color: 'var(--color-faint)' }}
        >
          <span>Installment</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={totalCount}
            onChange={(e) => setTotalCount(e.target.value)}
            placeholder="—"
            aria-label="Total payments (leave blank for an open-ended subscription)"
            className="tnum h-8 w-14 rounded-[var(--radius-sm)] border px-2 text-right"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          />
          <span>payments · next #</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={startSeq}
            onChange={(e) => setStartSeq(e.target.value)}
            placeholder="1"
            aria-label="Next payment number"
            className="tnum h-8 w-14 rounded-[var(--radius-sm)] border px-2 text-right"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          />
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

      {/* Schedule — cadence, then which day. One step, because "when does this repeat" is one
          question. Sets state and returns; does not submit. */}
      <div className={view === 'schedule' ? 'flex flex-col gap-3' : 'hidden'}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView('keypad')}
            className="tap text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            ‹ Back
          </button>
          <span className="text-sm font-semibold">Schedule</span>
        </div>

        <div className="panel flex gap-1 p-1">
          <CadenceLink label="Monthly" active={!isYearly} onClick={() => setIntervalMonths(1)} />
          <CadenceLink label="Yearly" active={isYearly} onClick={() => setIntervalMonths(12)} />
        </div>

        <p className="px-1 text-xs" style={{ color: 'var(--color-faint)' }}>
          {isYearly
            ? `Posts once a year, every ${monthName(month, true)} `
            : 'Posts every month on the '}
          {ordinal(day)}
          {day > 28 ? ' — short months post on their last day.' : '.'}
        </p>

        {/* A yearly rule needs a month too. It comes FIRST because it's the coarser choice, and
            tapping one stays on this view so you can then pick the day; only the day tap returns to
            the keypad, which keeps the two-part choice from closing half-made. */}
        {isYearly ? (
          <div className="grid grid-cols-6 gap-2">
            {MONTHS.map((m) => {
              const on = m === month;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonth(m)}
                  aria-pressed={on}
                  aria-label={monthName(m, true)}
                  className="tap aspect-square justify-center rounded-[var(--radius-md)] text-xs font-medium transition-colors active:opacity-70"
                  style={
                    on
                      ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' }
                      : { background: 'var(--color-surface-2)', color: 'var(--color-text)' }
                  }
                >
                  {monthName(m)}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-7 gap-2">
          {DAYS.map((d) => {
            const on = d === day;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDay(d);
                  setView('keypad');
                }}
                aria-pressed={on}
                className="tnum tap aspect-square justify-center rounded-[var(--radius-md)] text-sm font-medium transition-colors active:opacity-70"
                style={
                  on
                    ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-text)' }
                }
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Currency picker — same grid as the keypad's. */}
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
                  setRateStr(''); // back to the live rate for the new currency
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

      {/* Account picker — same grid as the keypad's. */}
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

      {/* Category grid — each tile submits the rule with its category, exactly as the keypad saves an
          expense. The tap IS the save. */}
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
          <span className="tnum text-sm font-semibold">
            {isThb
              ? formatBahtKeyed(amount ?? 0)
              : `${formatCurrency(amount ?? 0, currency)} · ${ordinal(day)}`}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((c) => {
            const on = ruleCategory === c.name;
            return (
              <button
                key={c.name}
                type="submit"
                name="category"
                value={c.name}
                aria-current={on ? 'true' : undefined}
                className="panel flex flex-col items-center gap-1 px-2 py-3 text-center transition-colors active:opacity-70"
                style={
                  on
                    ? { background: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
                    : undefined
                }
              >
                <CategoryIcon
                  emoji={c.emoji}
                  name={c.name}
                  size="lg"
                  iconSet={iconSet}
                  hue={c.hue}
                />
                <span
                  className="w-full truncate text-xs"
                  style={{ color: on ? 'var(--color-on-accent)' : 'var(--color-muted)' }}
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </form>
  );
}

// The cadence toggle's segments — same shape as the Records page's view tabs, since it does the same
// job: flip one axis without leaving the screen.
function CadenceLink({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex-1 rounded-[var(--radius-md)] py-2 text-center text-sm font-medium transition-colors duration-150"
      style={{
        background: active ? 'var(--color-accent-soft)' : 'transparent',
        color: active ? 'var(--color-accent-text)' : 'var(--color-muted)',
      }}
    >
      {label}
    </button>
  );
}
