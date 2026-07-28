import { describe, it, expect } from 'vitest';
import { parseEntryForm } from './entry-form';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}

const base = {
  direction: 'expense',
  account: 'cash',
  currency: 'THB',
  amount: '120',
  thb: '120',
  category: 'food',
  date: '2026-07-06',
  time: '',
  note: '',
};

const CODES = new Set(['THB', 'JPY', 'MOP']);

describe('parseEntryForm', () => {
  it('parses a THB expense — thb equals amount, blank time/note become null', () => {
    const result = parseEntryForm(formData(base), CODES);
    expect(result).toEqual({
      ok: true,
      entry: {
        date: '2026-07-06',
        time: null,
        account: 'cash',
        category: 'food',
        amount: -120,
        currency: 'THB',
        originalAmount: -120,
        note: null,
        offBudget: null,
      },
    });
  });

  it('parses a JPY expense with a separately-typed THB conversion', () => {
    const result = parseEntryForm(
      formData({
        ...base,
        currency: 'JPY',
        amount: '1000',
        thb: '230',
        account: 'jpy wallet',
        category: 'ramen',
        date: '2026-03-20',
        time: '19:45',
        note: 'dinner',
      }),
      CODES,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        date: '2026-03-20',
        time: '19:45',
        account: 'jpy wallet',
        category: 'ramen',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
        note: 'dinner',
        offBudget: null,
      },
    });
  });

  it('reads an explicit offBudget override (0/1); blank/absent stays null (inherit)', () => {
    const checked = parseEntryForm(formData({ ...base, offBudget: '1' }), CODES);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.entry.offBudget).toBe(1);

    const unchecked = parseEntryForm(formData({ ...base, offBudget: '0' }), CODES);
    expect(unchecked.ok).toBe(true);
    if (unchecked.ok) expect(unchecked.entry.offBudget).toBe(0);

    const untouched = parseEntryForm(formData(base), CODES); // no `offBudget` key in the form at all
    expect(untouched.ok).toBe(true);
    if (untouched.ok) expect(untouched.entry.offBudget).toBeNull();
  });

  it('flips the sign for income', () => {
    const result = parseEntryForm(
      formData({ ...base, direction: 'income', category: 'salary', amount: '50000', thb: '50000' }),
      CODES,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.amount).toBe(50000);
      expect(result.entry.originalAmount).toBe(50000);
    }
  });

  it('rejects an empty account', () => {
    expect(parseEntryForm(formData({ ...base, account: '' }), CODES)).toEqual({
      ok: false,
      error: 'Account is required.',
    });
  });

  it('rejects an empty category', () => {
    expect(parseEntryForm(formData({ ...base, category: '' }), CODES)).toEqual({
      ok: false,
      error: 'Category is required.',
    });
  });

  it('rejects an empty date', () => {
    expect(parseEntryForm(formData({ ...base, date: '' }), CODES)).toEqual({
      ok: false,
      error: 'Date is required.',
    });
  });

  it('rejects a code that is not in the catalog', () => {
    const fd = formData({ ...base, currency: 'XYZ' });
    expect(parseEntryForm(fd, CODES)).toEqual({ ok: false, error: 'Choose a valid currency.' });
  });

  it('accepts a code that only exists in the catalog, not in any const', () => {
    const fd = formData({ ...base, currency: 'MOP', amount: '114', thb: '515.19' });
    const result = parseEntryForm(fd, CODES);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-positive or non-numeric amount', () => {
    expect(parseEntryForm(formData({ ...base, amount: '0' }), CODES)).toEqual({
      ok: false,
      error: 'Amount must be a positive number.',
    });
    expect(parseEntryForm(formData({ ...base, amount: 'abc' }), CODES)).toEqual({
      ok: false,
      error: 'Amount must be a positive number.',
    });
  });

  it('rejects a non-positive THB amount when the currency is not THB', () => {
    expect(
      parseEntryForm(formData({ ...base, currency: 'JPY', amount: '1000', thb: '0' }), CODES),
    ).toEqual({ ok: false, error: 'THB amount must be a positive number.' });
  });
});
