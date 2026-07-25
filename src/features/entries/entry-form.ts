import type { EntryInput } from './schema';

// Every currency the ledger's data has seen (Monefy export + manual entries). THB is home
// currency; the rest need a manual THB conversion since there's no live FX lookup (deferred).
export const CURRENCIES = ['THB', 'JPY', 'KRW', 'USD', 'EUR', 'HKD', 'GBP', 'SGD'] as const;
export type Currency = (typeof CURRENCIES)[number];

const currencySet = new Set<string>(CURRENCIES);

export function isCurrency(value: string): value is Currency {
  return currencySet.has(value);
}

export type ParseResult = { ok: true; entry: EntryInput } | { ok: false; error: string };

function readString(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

// Pure: FormData → a validated EntryInput, or a human-readable error. No DB, no Next imports — the
// Server Action calling this is the only thing that touches the database. `amount` is the
// original-currency figure the user typed; `thb` is the THB-converted figure. For THB rows the
// two are equal by construction (the form never shows a second field for them), so `thb` is
// derived from `amount` in that branch rather than trusted from the form; only non-THB rows
// validate `thb` independently.
export function parseEntryForm(fd: FormData): ParseResult {
  const account = readString(fd, 'account');
  const category = readString(fd, 'category');
  const date = readString(fd, 'date');
  const time = readString(fd, 'time');
  const note = readString(fd, 'note');
  const currency = readString(fd, 'currency');
  const direction = readString(fd, 'direction') === 'income' ? 'income' : 'expense';

  if (account === '') return { ok: false, error: 'Account is required.' };
  if (category === '') return { ok: false, error: 'Category is required.' };
  if (date === '') return { ok: false, error: 'Date is required.' };
  if (!isCurrency(currency)) return { ok: false, error: 'Choose a valid currency.' };

  const amount = Number(readString(fd, 'amount'));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be a positive number.' };
  }

  let thb = amount;
  if (currency !== 'THB') {
    thb = Number(readString(fd, 'thb'));
    if (!Number.isFinite(thb) || thb <= 0) {
      return { ok: false, error: 'THB amount must be a positive number.' };
    }
  }

  // offBudget: '' (checkbox left untouched) means inherit the category default (null); '0'/'1' is
  // an explicit per-entry override written by the EntryForm toggle. Forms that don't render the
  // toggle (the Keypad) never submit this field, so readString's '' default lands here too.
  const offBudgetRaw = readString(fd, 'offBudget');
  const offBudget = offBudgetRaw === '' ? null : Number(offBudgetRaw);

  const sign = direction === 'income' ? 1 : -1;
  const entry: EntryInput = {
    date,
    time: time === '' ? null : time,
    account,
    category,
    amount: sign * thb,
    currency,
    originalAmount: sign * amount,
    note: note === '' ? null : note,
    offBudget,
  };
  return { ok: true, entry };
}
