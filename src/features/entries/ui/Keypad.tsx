'use client';

import { useState } from 'react';
import { formatBaht } from '@shared/money';
import { addEntryAction } from '../actions';
import { evaluate } from '../calc';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';

export type KeypadCategory = { name: string; emoji: string };

const OPS = '+−×÷';
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+'];

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
// One <form> stays mounted (views toggle via `hidden`) so date / account / note always post. The
// clicked category button carries the category value. Expense-only — direction is fixed.
export function Keypad({
  categories,
  accounts,
  defaultAccount,
  today,
}: {
  categories: KeypadCategory[];
  accounts: string[];
  defaultAccount: string;
  today: string;
}) {
  const [expr, setExpr] = useState('');
  const [picking, setPicking] = useState(false);

  const amount = evaluate(expr);
  const valid = amount !== null && amount > 0;
  const spaced = expr.replace(/([+−×÷])/g, ' $1 ').trim();

  return (
    <form action={addEntryAction} className="flex flex-col gap-4">
      <input type="hidden" name="currency" value="THB" />
      <input type="hidden" name="direction" value="expense" />
      <input type="hidden" name="amount" value={valid ? String(amount) : ''} />

      {/* Amount + inputs + keypad */}
      <div className={picking ? 'hidden' : 'flex flex-col gap-4'}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-sm" style={{ color: 'var(--color-muted)' }}>
            <span className="mb-1 block">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={today}
              className="h-11 w-full rounded-[var(--radius-sm)] border px-3 text-base"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
          </label>
          <label className="flex-1 text-sm" style={{ color: 'var(--color-muted)' }}>
            <span className="mb-1 block">Account</span>
            <select
              name="account"
              defaultValue={defaultAccount}
              className="h-11 w-full rounded-[var(--radius-sm)] border px-3 text-base"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            >
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
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
          onClick={() => setPicking(true)}
          disabled={!valid}
          className="btn btn-primary w-full disabled:opacity-40"
        >
          Choose category
        </button>
      </div>

      {/* Category grid — each tile submits the expense with its category. */}
      <div className={picking ? 'flex flex-col gap-3' : 'hidden'}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPicking(false)}
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
              <CategoryIcon emoji={c.emoji} name={c.name} size="lg" />
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
