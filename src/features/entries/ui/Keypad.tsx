'use client';

import { useId, useState, useTransition } from 'react';
import { formatBaht, formatBahtKeyed, formatCurrency } from '@shared/money';
import { formatDayHeading } from '@shared/date';
import { addEntryAction } from '../actions';
import { evaluate, nextExpr, OPS } from '../calc';
import { toThb } from '../fx';
import { isCurrency } from '../entry-form';
import type { Currency } from '../entry-form';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { AccountIcon } from '@features/accounts/ui/AccountIcon';
import { CloseButton } from './CloseButton';
import { refreshFxRatesAction } from '@features/settings/actions';
import { seedStarterSetAction } from '@features/categories/actions';
import type { IconSet, KeypadLayout } from '@features/settings/queries';
import type { EntryRow } from '../schema';

export type KeypadCategory = { name: string; emoji: string; hue?: number };
export type KeypadAccount = { name: string; icon: string; hue?: number };
export type KeypadCurrency = { code: Currency; symbol: string };

// The 4-column key grid. Only the digit rows differ between layouts: 'calc' is calculator order
// (7-8-9 top), 'phone' is telephone/ATM order (1-2-3 top). The operator column (÷ × − +) and the
// bottom row (. 0 ⌫ +) are identical in both.
const KEYPAD_KEYS: Record<KeypadLayout, string[]> = {
  calc: ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+'],
  phone: ['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', '.', '0', '⌫', '+'],
};

// The editable FX rate is shown to 4 decimals (enough for every supported currency; the smallest,
// KRW, is ~0.023 THB per unit). useGrouping off so the value stays a valid <input type=number>.
const rateFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
  useGrouping: false,
});
function formatRate(rate: number): string {
  return rateFmt.format(rate);
}

function chipStyle(selected: boolean): React.CSSProperties {
  return selected
    ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' }
    : {
        background: 'var(--color-surface-2)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      };
}

// The date chip's leading glyph, marking the chip as the date control whatever label it carries.
// Inline SVG in the app's chrome-icon house style (cf. BottomBar) — stroke inherits the chip's color.
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="3.5"
        width="11"
        height="10"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2.5 6.4h11 M5.5 2.4v2.2 M10.5 2.4v2.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Which ฿ formatter applies here turns on ONE question: did the user key this figure, or did we
// compute it?
//   KEYED (formatBahtKeyed) — echo it back as typed: ฿123 stays ฿123, ฿123.1 stays ฿123.1. Padding an
//     input to ฿123.10 puts digits on screen the user didn't type. Don't "fix" this to formatBaht.
//   COMPUTED (formatBaht) — a foreign amount × the FX rate is our arithmetic, not their keystrokes,
//     so it states its satang like any ledger figure: ฿3,651.20, never ฿3,651.2. formatBahtKeyed's
//     minimumFractionDigits:0 drops that trailing zero, which is right for an input and wrong for
//     money we worked out — 107 × 34.1234 rendering as "฿3,651.2" is the bug that motivated the split.
//
// Monefy-style expense entry: a calculator keypad for the amount, then a category grid that submits.
// Four views (keypad / account / currency / category) toggle via `hidden` inside one always-mounted
// <form>. The amount you key in is in the selected `currency`; for a non-THB currency the THB value
// posted (hidden `thb`) is the foreign amount × the effective (fee-inclusive) rate. Reused for the
// new-entry route and for editing an expense (THB or foreign) — pass `entry` + editEntryAction.
export function Keypad({
  categories,
  accounts,
  currencies,
  currencyCodes,
  notes,
  rates,
  ratesAsOf,
  defaultAccount,
  today,
  iconSet,
  keypadLayout,
  action = addEntryAction,
  entry,
  offBudgetCategories,
  travelCurrencies,
}: {
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  currencies: KeypadCurrency[];
  currencyCodes: Set<string>; // the catalog's valid codes, for isCurrency
  notes: string[];
  rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
  ratesAsOf: Record<string, string>;
  defaultAccount: string;
  today: string;
  iconSet: IconSet;
  keypadLayout: KeypadLayout;
  action?: (formData: FormData) => Promise<void>;
  entry?: EntryRow;
  offBudgetCategories: Set<string>;
  travelCurrencies: Set<string>; // off-budget toggle's travel-currency tier — mirrors isOffBudget
}) {
  const noteListId = useId();
  const initialCurrency: Currency =
    entry && entry.currency !== null && isCurrency(entry.currency, currencyCodes)
      ? entry.currency
      : 'THB';
  const initialForeign = entry
    ? String(
        Math.abs(
          initialCurrency !== 'THB' && entry.originalAmount !== null
            ? entry.originalAmount
            : entry.amount,
        ),
      )
    : '';
  // Preserve an edited foreign row's own rate: its stored effective rate = |THB| / |foreign|. `null`
  // means "follow the cached rate" (a new entry); a string is a shown/typed value.
  const initialOverride: string | null =
    entry && initialCurrency !== 'THB' && entry.originalAmount
      ? formatRate(Math.abs(entry.amount) / Math.abs(entry.originalAmount))
      : null;

  const [expr, setExpr] = useState(initialForeign);
  const [view, setView] = useState<'keypad' | 'account' | 'currency' | 'category'>('keypad');
  const [date, setDate] = useState(entry?.date ?? today);
  const [account, setAccount] = useState(entry?.account ?? defaultAccount);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  // `null` = follow the cached rate (shown to 4 dp); a string = the value the user typed/edited.
  const [rateOverride, setRateOverride] = useState<string | null>(initialOverride);
  const [isRefreshing, startRefresh] = useTransition();
  // Which picker is currently naming a new entry, and the name being typed. A fresh ledger has no
  // categories and no accounts, and the keypad could only ever pick from what already existed — so
  // the first run dead-ended on a blank chooser. Naming one here is enough: categoryIdFor and
  // accountIdFor both insert-on-conflict-do-nothing when the expense is written, giving the new row
  // a keyword-derived icon, so nothing has to be created up front.
  const [naming, setNaming] = useState<null | 'category' | 'account'>(null);
  const [draftName, setDraftName] = useState('');
  const [isSeeding, startSeeding] = useTransition();

  // DERIVED, not synced. The keypad deliberately survives a data refetch now (see use-new-entry),
  // so it also keeps an `account` picked before there WERE any accounts — the empty string. Seeding
  // the starter set mid-entry hit exactly that: the tiles arrived, the expense submitted with no
  // account, and the row was silently lost. Reading through the default instead of writing state in
  // an effect fixes it without a cascading render, and an explicit choice still wins because
  // setAccount makes `account` non-empty.
  const effectiveAccount = account === '' ? defaultAccount : account;

  // Tri-state backed by a 2-state checkbox — mirrors EntryForm's toggle. Untouched follows the
  // effective default for the entry's own category (there's no "currently selected category" for a
  // NEW entry: the category grid submits on tap, so nothing is picked yet at this point in the
  // flow, and the default correctly falls back to "no category, no default"). Editing an existing
  // entry starts already touched when it carries its own explicit override.
  const category = entry?.category ?? '';
  const [offBudgetTouched, setOffBudgetTouched] = useState(
    entry !== undefined && entry.offBudget !== null,
  );
  const [offBudgetOverride, setOffBudgetOverride] = useState(entry?.offBudget === 1);
  // Mirrors isOffBudget's tiers: an explicit per-entry value always wins; untouched, a travel
  // currency (checked against the CURRENTLY selected currency, so switching to JPY mid-entry updates
  // the checkbox live) ORs in on top of the category default. Without this, opening an existing JPY
  // entry showed the box unchecked while isOffBudget already returned true for it — and toggling it
  // on-then-off wrote an explicit 0, forcing that trip spend back into the budget.
  const offBudgetChecked = offBudgetTouched
    ? offBudgetOverride
    : offBudgetCategories.has(category) || travelCurrencies.has(currency);

  const isCustomDate = date !== today;
  const amount = evaluate(expr); // the FOREIGN figure keyed in
  const validAmount = amount !== null && amount > 0;
  const isThb = currency === 'THB';
  const symbol = currencies.find((c) => c.code === currency)?.symbol ?? currency;

  // The value shown IN the rate field — and used to convert, so what you see is what converts. When
  // following the cache (rateOverride === null) it's the fee-inclusive rate to 4 dp, which lets a
  // refresh update it live; once the user types, their string wins.
  const cached = rates[currency];
  const rateStr = rateOverride ?? (cached !== undefined ? formatRate(cached) : '');
  const rateNum = rateStr.trim() === '' ? null : Number(rateStr);
  const effectiveRate =
    rateNum !== null && Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null;
  const hasRate = isThb || effectiveRate !== null;
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
      <input type="hidden" name="account" value={effectiveAccount} />
      {/* Tri-state: '' (untouched, inherits the category default) or an explicit '0'/'1' once the
          user has flipped the checkbox below. parseEntryForm reads this the same way it reads
          EntryForm's identically-named field. */}
      <input
        type="hidden"
        name="offBudget"
        value={offBudgetTouched ? (offBudgetOverride ? '1' : '0') : ''}
      />

      {/* Amount + inputs + keypad */}
      <div className={view === 'keypad' ? 'flex flex-col gap-4' : 'hidden'}>
        {/* date — then currency · account · × pushed right (ml-auto on the currency chip). This one
            row is also the page's chrome: it carries the close control, which is what lets the route
            drop its "Add expense" title block entirely and start the keypad ~90px higher. The × only
            renders on this view — the inner steps have their own "‹ Back", and two back-ish controls
            on one screen would be ambiguous. The account is the only chip that can run long, so it
            alone shrinks (min-w-0 → truncate) once the slack is spent. */}
        <div className="flex items-center gap-2">
          {/* Date chip → the native picker. One control that always states the date it will save:
              "Today" is simply the human name for today's, so no second reset button is needed. */}
          <span className="relative inline-flex shrink-0">
            <span
              className="tap justify-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors"
              style={chipStyle(isCustomDate)}
            >
              <CalendarIcon />
              {isCustomDate ? formatDayHeading(date) : 'Today'}
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
              aria-label={`Date: ${formatDayHeading(date)}. Pick another date`}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>

          {/* Currency chip → opens the currency grid. */}
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

          {/* Account chip → opens the account grid. */}
          <button
            type="button"
            onClick={() => setView('account')}
            aria-haspopup="true"
            aria-label={`Account: ${effectiveAccount}`}
            className="tap min-w-0 justify-center gap-1.5 rounded-full px-3 text-sm font-medium active:opacity-70"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          >
            <span className="min-w-0 truncate">{effectiveAccount}</span>
            <span aria-hidden className="shrink-0">
              ▾
            </span>
          </button>

          {/* × closes the flow, and sits where a dismiss belongs: the right edge, exactly where it sat
              when this was a page header. A back chevron would go top-left, but this isn't one (see
              CloseButton) — putting an × there would borrow the back button's position for a glyph
              that doesn't mean back. Every other × in the app right-aligns too (search clear, budget
              clear). ml-1 buys a little over the gap: × discards a keyed amount, so it shouldn't sit a
              thumb's width from the account chip. */}
          <CloseButton className="-mr-1 ml-1" />
        </div>

        <div className="panel flex flex-col items-end gap-1 px-5 py-4">
          {/* min-h reserves the expression line so the panel doesn't grow (and shove the keypad
              down) the moment you type the first key — an empty whitespace node collapses to 0. */}
          <span className="tnum min-h-5 text-sm" style={{ color: 'var(--color-faint)' }}>
            {spaced}
          </span>
          <span
            className="tnum text-4xl font-semibold"
            style={{ color: validAmount ? 'var(--color-text)' : 'var(--color-faint)' }}
          >
            {isThb ? formatBahtKeyed(amount ?? 0) : formatCurrency(amount ?? 0, currency)}
          </span>

          {/* Rate line — only for a non-THB currency. Rate is editable (per-entry override, shown to
              4 dp); blank falls back to the cached effective rate. The ↻ button refreshes the ECB
              rates in place; the "as of" date shows how fresh the cached rate is. */}
          {!isThb ? (
            <div className="mt-1 flex w-full flex-col items-end gap-2">
              {/* THB hero — for a THB tracker, "what it cost you" is the number that matters, so the
                  converted baht reads large; the keyed foreign figure above stays the input focus. */}
              <div className="flex items-baseline gap-1.5">
                <span className="text-base" style={{ color: 'var(--color-muted)' }}>
                  =
                </span>
                <span
                  className="tnum text-[1.75rem] leading-none font-bold"
                  style={{ color: hasRate ? 'var(--color-text)' : 'var(--color-faint)' }}
                >
                  {hasRate ? formatBaht(thbValue) : 'no rate'}
                </span>
              </div>

              {/* Quiet caption: the editable rate (left) and the ECB source + refresh (right). The
                  rate input still drives the conversion — what you see is what converts. */}
              <div
                className="flex w-full items-center justify-between gap-2 text-xs"
                style={{ color: 'var(--color-faint)' }}
              >
                <span className="tnum inline-flex items-center gap-1.5">
                  1 {currency} =
                  <input
                    name="rate-display"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={rateStr}
                    onChange={(e) => setRateOverride(e.target.value)}
                    placeholder="rate"
                    aria-label={`THB per 1 ${currency}`}
                    className="tnum h-8 w-20 rounded-[var(--radius-sm)] border px-2 text-right"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                  />
                  THB
                </span>
                <span className="tnum inline-flex items-center gap-1.5 whitespace-nowrap">
                  {ratesAsOf[currency] !== undefined
                    ? `ECB ${ratesAsOf[currency]}`
                    : 'no rate cached'}
                  <button
                    type="button"
                    onClick={() => {
                      // Drop any seeded/typed rate so the field follows the freshly fetched cache —
                      // this is what lets ↻ re-price an edited entry at today's rate.
                      setRateOverride(null);
                      startRefresh(async () => refreshFxRatesAction());
                    }}
                    disabled={isRefreshing}
                    aria-label="Refresh FX rates"
                    className="tap justify-center rounded-full px-1 disabled:opacity-40"
                    style={{ color: 'var(--color-accent-text)' }}
                  >
                    <span
                      aria-hidden
                      className={isRefreshing ? 'inline-block animate-spin' : undefined}
                    >
                      ↻
                    </span>
                  </button>
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {!isThb && !hasRate ? (
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            No {currency} rate cached. Tap ↻ above to fetch the latest ECB rates, or type a rate.
          </p>
        ) : null}

        <div className="grid grid-cols-4 gap-2">
          {KEYPAD_KEYS[keypadLayout].map((key) => {
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

        {/* One-off override — same tri-state as EntryForm's toggle, checked by default when the
            entry's own category is off-budget by default (or, on edit, when the entry already
            carries an explicit override). */}
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
          <input
            type="checkbox"
            checked={offBudgetChecked}
            onChange={(e) => {
              setOffBudgetTouched(true);
              setOffBudgetOverride(e.target.checked);
            }}
          />
          Exclude from budget (one-off)
        </label>

        {/* The note sits between the keypad and the category step, following the order you fill them
            in: key the amount, annotate it, then pick the category that saves it. Enter never submits
            implicitly (HTML spec) — it advances to the category grid, the same as the button below,
            and blurs first so the on-screen keyboard uncovers the grid it's advancing to. */}
        {/* The suggestions are past notes from the ledger, not browser autofill: the keypad submits
            through a React action, so the browser never records a value to autofill from. */}
        <input
          name="note"
          list={noteListId}
          placeholder="Note (optional)"
          defaultValue={entry?.note ?? ''}
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
        <datalist id={noteListId}>
          {notes.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

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
                  setRateOverride(null); // follow the cached rate for the new currency
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
            const on = effectiveAccount === a.name;
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
          {/* Dashed, so it reads as "make one" rather than another account to pick. */}
          <button
            type="button"
            onClick={() => {
              setDraftName('');
              setNaming('account');
            }}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed px-2 text-center text-xs font-medium transition-colors active:opacity-70"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-muted)' }}
          >
            <span aria-hidden className="text-2xl leading-none">
              +
            </span>
            <span>New</span>
          </button>
        </div>
        {naming === 'account' ? (
          <NameDraft
            label="Account name"
            value={draftName}
            onChange={setDraftName}
            onCancel={() => setNaming(null)}
            onConfirm={() => {
              // The row itself is created by accountIdFor when the expense is written; picking it
              // here is the same act as picking an existing one.
              setAccount(draftName.trim());
              setNaming(null);
              setView('keypad');
            }}
          />
        ) : null}
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
          {/* Same figure, either provenance: for THB it IS the keyed amount, for a foreign currency
              it's the converted one — so it formats by whichever it is. */}
          <span className="tnum text-sm font-semibold">
            {isThb ? formatBahtKeyed(thbValue) : formatBaht(thbValue)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((c) => {
            // Only ever true when editing: this marks the expense's current category, since a tap
            // submits rather than toggles. Filled (not outlined) to match the Account picker above —
            // the label has to come along, because --color-muted on the accent fill is 2.4:1.
            const on = entry?.category === c.name;
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
                    ? {
                        background: 'var(--color-accent)',
                        borderColor: 'var(--color-accent)',
                      }
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
          {/* Always present, not only when the grid is empty: adding a category used to mean
              abandoning the half-typed expense for More → Categories and starting over. */}
          <button
            type="button"
            onClick={() => {
              setDraftName('');
              setNaming('category');
            }}
            className="panel flex flex-col items-center justify-center gap-1 border-dashed px-2 py-3 text-center transition-colors active:opacity-70"
            style={{ borderColor: 'var(--color-border-strong)' }}
          >
            <span
              aria-hidden
              className="text-2xl leading-none"
              style={{ color: 'var(--color-muted)' }}
            >
              +
            </span>
            <span className="w-full truncate text-xs" style={{ color: 'var(--color-muted)' }}>
              New
            </span>
          </button>
        </div>

        {naming === 'category' ? (
          <NameDraft
            label="Category name"
            value={draftName}
            onChange={setDraftName}
            onCancel={() => setNaming(null)}
            // Submits the expense with the typed name — categoryIdFor creates the row on write and
            // defaultEmojiFor gives it a glyph, so there is nothing to save separately.
            submitAs={draftName.trim()}
          />
        ) : null}

        {/* A blank chooser was the first-run dead end: no categories, no empty state, no way out
            but to leave the keypad. The starter set seeds accounts too, since an expense needs
            both and splitting it would mean two prompts on the same first run. */}
        {categories.length === 0 && naming === null ? (
          <div className="panel flex flex-col items-center gap-3 px-6 py-10 text-center">
            <h2 className="text-base font-semibold">No categories yet</h2>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Start with a standard set — ten categories plus Cash and Card — then rename whatever
              doesn&rsquo;t fit. Or make your own with + New above.
            </p>
            <button
              type="button"
              disabled={isSeeding}
              onClick={() => startSeeding(() => void seedStarterSetAction())}
              className="btn btn-primary"
            >
              {isSeeding ? 'Adding…' : 'Use the starter set'}
            </button>
          </div>
        ) : null}
      </div>
    </form>
  );
}

// The inline "name it" row shared by both pickers. `submitAs` makes the confirm a real form submit
// carrying that category (the expense is saved in the same tap); without it the confirm is a plain
// button and the caller decides what to do. Blank names can't be confirmed — a trimmed-empty
// category would otherwise be created as a row with no name.
function NameDraft({
  label,
  value,
  onChange,
  onCancel,
  onConfirm,
  submitAs,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm?: () => void;
  submitAs?: string;
}) {
  const empty = value.trim() === '';
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span style={{ color: 'var(--color-muted)' }}>{label}</span>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Matches the note field above verbatim — there is no .input class in globals.css, and a
          // one-off style here would be the second text field in this component wearing a different
          // face.
          className="h-11 w-full rounded-[var(--radius-sm)] border px-3 text-base"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          placeholder="e.g. Coffee"
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost flex-1">
          Cancel
        </button>
        {submitAs === undefined ? (
          <button
            type="button"
            disabled={empty}
            onClick={onConfirm}
            className="btn btn-primary flex-1"
          >
            Use it
          </button>
        ) : (
          <button
            type="submit"
            name="category"
            value={submitAs}
            disabled={empty}
            className="btn btn-primary flex-1"
          >
            Use it
          </button>
        )}
      </div>
    </div>
  );
}
