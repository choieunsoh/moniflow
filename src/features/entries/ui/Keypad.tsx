'use client';

import { useState } from 'react';
import { formatBaht } from '@shared/money';
import { shiftIso, formatDayHeading } from '@shared/date';
import { addEntryAction } from '../actions';
import { evaluate } from '../calc';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import type { IconSet } from '@features/settings/queries';

export type KeypadCategory = { name: string; emoji: string; hue?: number };

const OPS = '+−×÷';
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+'];

// Shared pill look for the quick-date chips. `.tap` guarantees the 44px touch target; the style
// helper toggles accent fill (selected) vs bordered surface.
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

// A one-tap selectable pill. aria-pressed carries the toggle state to assistive tech; the global
// :focus-visible rule supplies the focus ring.
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
// Three views (keypad / account picker / category picker) toggle via `hidden` inside one always-
// mounted <form>, so date / account / note always post. The account picker just sets state and
// returns; the category tile is what submits. Expense-only — direction is fixed.
export function Keypad({
  categories,
  accounts,
  defaultAccount,
  today,
  iconSet,
}: {
  categories: KeypadCategory[];
  accounts: string[];
  defaultAccount: string;
  today: string;
  iconSet: IconSet;
}) {
  const [expr, setExpr] = useState('');
  const [view, setView] = useState<'keypad' | 'account' | 'category'>('keypad');
  const [date, setDate] = useState(today);
  const [account, setAccount] = useState(defaultAccount);

  const yesterday = shiftIso(today, -1);
  const isCustomDate = date !== today && date !== yesterday;
  const amount = evaluate(expr);
  const valid = amount !== null && amount > 0;
  const spaced = expr.replace(/([+−×÷])/g, ' $1 ').trim();

  return (
    <form action={addEntryAction} className="flex flex-col gap-4">
      <input type="hidden" name="currency" value="THB" />
      <input type="hidden" name="direction" value="expense" />
      <input type="hidden" name="amount" value={valid ? String(amount) : ''} />
      <input type="hidden" name="account" value={account} />

      {/* Amount + inputs + keypad */}
      <div className={view === 'keypad' ? 'flex flex-col gap-4' : 'hidden'}>
        {/* Date: one-tap Today/Yesterday chips for the common case. The third chip is "Earlier…"; a
            transparent native date input sits on top of it, so tapping opens the OS picker, and once a
            further-back day is chosen the chip shows it (e.g. "Wed 9 Jul") and reads as selected. The
            input holds the posted `date` in all three cases. */}
        <div className="flex flex-col gap-2">
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Date
          </span>
          <div className="flex gap-2">
            <Chip selected={date === today} onClick={() => setDate(today)}>
              Today
            </Chip>
            <Chip selected={date === yesterday} onClick={() => setDate(yesterday)}>
              Yesterday
            </Chip>
            <span className="relative inline-flex shrink-0">
              <span className={pillClass} style={chipStyle(isCustomDate)}>
                {isCustomDate ? formatDayHeading(date) : 'Earlier…'}
              </span>
              <input
                type="date"
                name="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Pick another date"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
          </div>
        </div>

        {/* Account: collapsed to a single chip showing the current (default = last-used) account. Tap
            to open the full account grid — same second-view pattern as the category picker. Posts via
            the hidden `account`. */}
        <div className="flex flex-col gap-2">
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Account
          </span>
          <button
            type="button"
            onClick={() => setView('account')}
            aria-haspopup="true"
            className="tap max-w-full justify-center gap-1.5 self-start rounded-full px-4 text-sm font-medium active:opacity-70"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          >
            <span className="truncate">{account}</span>
            <span aria-hidden>▾</span>
          </button>
        </div>

        <div className="panel flex flex-col items-end gap-1 px-5 py-4">
          <span className="tnum text-sm" style={{ color: 'var(--color-faint)' }}>
            {spaced || ' '}
          </span>
          <span
            className="tnum text-4xl font-semibold"
            style={{ color: valid ? 'var(--color-text)' : 'var(--color-faint)' }}
          >
            {formatBaht(amount ?? 0)}
          </span>
        </div>

        <input
          name="note"
          placeholder="Note (optional)"
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
          disabled={!valid}
          className="btn btn-primary w-full disabled:opacity-40"
        >
          Choose category
        </button>
      </div>

      {/* Account picker — a grid of every account (most-used first). Tapping one sets the account and
          returns to the keypad; it does not submit. */}
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
        {/* Square 3-col tiles, mirroring the category grid so a per-account icon drops into the slot
            above the name later. */}
        <div className="grid grid-cols-3 gap-2">
          {accounts.map((a) => {
            const on = account === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAccount(a);
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
                {/* icon slot — per-account icon goes here later */}
                <span className="line-clamp-3 w-full">{a}</span>
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
          <span className="tnum text-sm font-semibold">{formatBaht(amount ?? 0)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((c) => (
            <button
              key={c.name}
              type="submit"
              name="category"
              value={c.name}
              className="panel flex flex-col items-center gap-1 px-2 py-3 text-center transition-colors active:opacity-70"
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
