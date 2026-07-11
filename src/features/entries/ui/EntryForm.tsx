'use client';

import { useId, useState } from 'react';
import { CURRENCIES } from '../entry-form';
import type { EntryRow } from '../schema';

type EntryFormProps = {
  action: (formData: FormData) => Promise<void>;
  accounts: string[];
  categories: string[];
  entry?: EntryRow;
};

const fieldClass = 'min-h-11 rounded-[var(--radius-sm)] border px-3 py-2 text-base';
const fieldStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' };

// Add/edit form for a single ledger row, reused by both routes. Controlled only where behavior
// demands it (currency <-> manual THB field); everything else is an uncontrolled
// <form action={action}> submit straight to a Server Action — no useActionState, matching the
// dashboard's no-client-JS-unless-needed stance as closely as a mutable form allows.
export function EntryForm({ action, accounts, categories, entry }: EntryFormProps) {
  const [currency, setCurrency] = useState(entry?.currency ?? 'THB');
  const accountListId = useId();
  const categoryListId = useId();
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
          <input
            name="account"
            list={accountListId}
            defaultValue={entry?.account ?? ''}
            required
            className={fieldClass}
            style={fieldStyle}
          />
          <datalist id={accountListId}>
            {accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Category
          <input
            name="category"
            list={categoryListId}
            defaultValue={entry?.category ?? ''}
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
            {CURRENCIES.map((c) => (
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

      <label className="flex flex-col gap-1 text-sm">
        Note
        <input
          name="note"
          defaultValue={entry?.note ?? ''}
          className={fieldClass}
          style={fieldStyle}
        />
      </label>

      <button type="submit" className="btn btn-primary self-start">
        {entry ? 'Save changes' : 'Add entry'}
      </button>
    </form>
  );
}
