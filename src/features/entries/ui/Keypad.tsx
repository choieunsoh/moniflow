'use client';

import { useState } from 'react';
import { formatBaht } from '@shared/money';
import { formatDayHeading } from '@shared/date';
import { addEntryAction } from '../actions';
import { evaluate } from '../calc';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { AccountIcon } from '@features/accounts/ui/AccountIcon';
import type { IconSet } from '@features/settings/queries';
import type { EntryRow } from '../schema';
import { SortableGrid } from './SortableGrid';
import { reorderCategories } from '@features/categories/actions';
import { reorderAccounts } from '@features/accounts/actions';

export type KeypadCategory = { name: string; emoji: string; hue?: number };
export type KeypadAccount = { name: string; icon: string; hue?: number };

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
// returns; the category tile is what submits. THB-expense only (direction fixed) — reused for both
// the new-entry route and editing a THB expense; pass `entry` + editEntryAction to edit an existing
// row (its id + time ride along as hidden fields so the update preserves them).
export function Keypad({
  categories,
  accounts,
  defaultAccount,
  today,
  iconSet,
  action = addEntryAction,
  entry,
}: {
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  defaultAccount: string;
  today: string;
  iconSet: IconSet;
  action?: (formData: FormData) => Promise<void>;
  entry?: EntryRow;
}) {
  const [expr, setExpr] = useState(entry ? String(Math.abs(entry.amount)) : '');
  const [view, setView] = useState<'keypad' | 'account' | 'category'>('keypad');
  const [date, setDate] = useState(entry?.date ?? today);
  const [account, setAccount] = useState(entry?.account ?? defaultAccount);

  const isCustomDate = date !== today;
  const amount = evaluate(expr);
  const valid = amount !== null && amount > 0;
  const spaced = expr.replace(/([+−×÷])/g, ' $1 ').trim();

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* Edit mode: carry the row id and its existing time so the update targets the right row and
          doesn't null a time the keypad has no field for. */}
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      {entry ? <input type="hidden" name="time" value={entry.time ?? ''} /> : null}
      <input type="hidden" name="currency" value="THB" />
      <input type="hidden" name="direction" value="expense" />
      <input type="hidden" name="amount" value={valid ? String(amount) : ''} />
      <input type="hidden" name="account" value={account} />

      {/* Amount + inputs + keypad */}
      <div className={view === 'keypad' ? 'flex flex-col gap-4' : 'hidden'}>
        {/* Date + account on one compact row: a Today chip and an "Earlier…" chip, then the account
            chip pushed to the right. The "Earlier…" chip carries a transparent native date input (tap
            anywhere opens the OS picker); once another day is chosen it shows that day (e.g. "Wed 9
            Jul") and reads as selected. Wraps if names run long. */}
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
              // No spending in the future: `max` disables later days in the OS picker; the guard
              // rejects an empty or future value from a typed/edge case (ISO strings compare
              // chronologically), so `date` stays a valid past-or-today day.
              onChange={(e) => {
                const v = e.target.value;
                if (v && v <= today) setDate(v);
              }}
              // Open the OS picker from a tap anywhere on the chip, not just the (invisible)
              // calendar indicator. showPicker throws if unsupported or already open — ignore it.
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

          {/* Account chip → opens the account grid (second view). Pushed to the right of the date
              chips; the current (default = last-used) account posts via the hidden `account`. */}
          <button
            type="button"
            onClick={() => setView('account')}
            aria-haspopup="true"
            aria-label={`Account: ${account}`}
            className="tap ml-auto max-w-full shrink-0 justify-center gap-1.5 rounded-full px-4 text-sm font-medium active:opacity-70"
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
        {/* Square 3-col tiles mirroring the category grid: the per-account brand glyph sits on a hue
            disc above the name (AccountIcon), same as CategoryIcon in the category grid below. */}
        <SortableGrid
          id="keypad-accounts"
          items={accounts}
          getId={(a) => a.name}
          onReorder={(ordered) => void reorderAccounts(ordered.map((a) => a.name))}
          className="grid grid-cols-3 gap-2"
        >
          {(a, tile) => {
            const on = account === a.name;
            return (
              <button
                ref={tile.setNodeRef}
                type="button"
                {...tile.attributes}
                {...tile.listeners}
                onClick={() => {
                  if (tile.justDragged()) return; // a drag just ended — don't select
                  setAccount(a.name);
                  setView('keypad');
                }}
                aria-pressed={on}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border px-2 text-center text-xs font-medium active:opacity-70"
                style={{
                  ...(on
                    ? {
                        background: 'var(--color-accent)',
                        color: 'var(--color-on-accent)',
                        borderColor: 'var(--color-accent)',
                      }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-text)' }),
                  ...tile.style,
                }}
              >
                <AccountIcon icon={a.icon} name={a.name} size="lg" hue={a.hue} />
                <span className="line-clamp-3 w-full">{a.name}</span>
              </button>
            );
          }}
        </SortableGrid>
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
        <SortableGrid
          id="keypad-categories"
          items={categories}
          getId={(c) => c.name}
          onReorder={(ordered) => void reorderCategories(ordered.map((c) => c.name))}
          className="grid grid-cols-3 gap-2"
        >
          {(c, tile) => (
            <button
              ref={tile.setNodeRef}
              type="submit"
              name="category"
              value={c.name}
              {...tile.attributes}
              {...tile.listeners}
              // A drop synthesizes a click on the tile under the finger — cancel the submit then.
              onClick={(e) => {
                if (tile.justDragged()) e.preventDefault();
              }}
              className="panel flex flex-col items-center gap-1 px-2 py-3 text-center active:opacity-70"
              style={{
                ...(entry?.category === c.name
                  ? {
                      borderColor: 'var(--color-accent)',
                      boxShadow: 'inset 0 0 0 1px var(--color-accent)',
                    }
                  : {}),
                ...tile.style,
              }}
            >
              <CategoryIcon emoji={c.emoji} name={c.name} size="lg" iconSet={iconSet} hue={c.hue} />
              <span className="w-full truncate text-xs" style={{ color: 'var(--color-muted)' }}>
                {c.name}
              </span>
            </button>
          )}
        </SortableGrid>
      </div>
    </form>
  );
}
