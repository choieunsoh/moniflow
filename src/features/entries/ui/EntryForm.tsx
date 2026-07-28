'use client';

import { useId, useState } from 'react';
import type { EntryRow } from '../schema';

type EntryFormProps = {
  action: (formData: FormData) => Promise<void>;
  accounts: string[];
  categories: string[];
  currencies: string[];
  notes: string[];
  entry?: EntryRow;
  offBudgetCategories: Set<string>;
};

const fieldClass = 'min-h-11 rounded-[var(--radius-sm)] border px-3 py-2 text-base';
const fieldStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' };

// Add/edit form for a single ledger row, reused by both routes. Controlled only where behavior
// demands it (currency <-> manual THB field, category <-> off-budget toggle default); everything
// else is an uncontrolled <form action={action}> submit straight to a Server Action — no
// useActionState, matching the dashboard's no-client-JS-unless-needed stance as closely as a
// mutable form allows.
export function EntryForm({
  action,
  accounts,
  categories,
  currencies,
  notes,
  entry,
  offBudgetCategories,
}: EntryFormProps) {
  const [currency, setCurrency] = useState(entry?.currency ?? 'THB');
  const [category, setCategory] = useState(entry?.category ?? '');
  // Tri-state backed by a 2-state checkbox: untouched follows the selected category's off-budget
  // default (offBudgetCategories) and submits '' (null, inherit); once flipped it's an explicit
  // override and submits '0'/'1'. On edit, `entry.offBudget !== null` starts it already touched, so
  // it shows the entry's own stored value rather than the (possibly different) category default.
  const [offBudgetTouched, setOffBudgetTouched] = useState(
    entry !== undefined && entry.offBudget !== null,
  );
  const [offBudgetOverride, setOffBudgetOverride] = useState(entry?.offBudget === 1);
  const offBudgetChecked = offBudgetTouched ? offBudgetOverride : offBudgetCategories.has(category);
  const categoryListId = useId();
  const noteListId = useId();
  const needsManualThb = currency !== 'THB';

  return (
    <form action={action} className="panel flex flex-col gap-4 p-5">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}

      <fieldset className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="direction"
            value="expense"
            defaultChecked={entry ? entry.amount < 0 : true}
          />
          Expense
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="direction"
            value="income"
            defaultChecked={entry ? entry.amount > 0 : false}
          />
          Income
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Account
          <select
            name="account"
            defaultValue={entry?.account ?? accounts[0] ?? ''}
            required
            className={fieldClass}
            style={fieldStyle}
          >
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Category
          <input
            name="category"
            list={categoryListId}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className={fieldClass}
            style={fieldStyle}
          />
          <datalist id={categoryListId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Currency
          <select
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {needsManualThb ? `Amount (${currency})` : 'Amount (THB)'}
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={entry ? Math.abs(entry.originalAmount ?? entry.amount) : undefined}
            required
            className={`tnum ${fieldClass}`}
            style={fieldStyle}
          />
        </label>

        {needsManualThb ? (
          <label className="flex flex-col gap-1 text-sm">
            THB amount
            <input
              name="thb"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={entry ? Math.abs(entry.amount) : undefined}
              required
              className={`tnum ${fieldClass}`}
              style={fieldStyle}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            name="date"
            type="date"
            defaultValue={entry?.date ?? ''}
            required
            className={`tnum ${fieldClass}`}
            style={fieldStyle}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Time
          <input
            name="time"
            type="time"
            defaultValue={entry?.time ?? ''}
            className={`tnum ${fieldClass}`}
            style={fieldStyle}
          />
        </label>
      </div>

      {/* Hidden field carries the tri-state value the checkbox below represents: '' (untouched,
          inherits the category default) or an explicit '0'/'1' once the user has flipped it. The
          checkbox itself has no `name` so its own on/off submission never fights this field. */}
      <input
        type="hidden"
        name="offBudget"
        value={offBudgetTouched ? (offBudgetOverride ? '1' : '0') : ''}
      />
      <label className="flex items-center gap-2 text-sm">
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

      <label className="flex flex-col gap-1 text-sm">
        Note
        {/* Single-line input, but Enter is swallowed: a text input inside the form implicitly submits
            on Enter (HTML spec), which saved the entry prematurely. preventDefault on Enter keeps the
            field single-line and stops the accidental save (use the button to save). */}
        <input
          name="note"
          list={noteListId}
          defaultValue={entry?.note ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          className={fieldClass}
          style={fieldStyle}
        />
        {/* Past notes, not browser autofill: these forms submit through a React action, so the
            browser never records a value to autofill from. The ledger is the only history there is. */}
        <datalist id={noteListId}>
          {notes.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>

      <button type="submit" className="btn btn-primary self-start">
        {entry ? 'Save changes' : 'Add entry'}
      </button>
    </form>
  );
}
