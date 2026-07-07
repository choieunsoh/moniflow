import { describe, it, expect } from 'vitest';
import { parseEntryForm, CURRENCIES } from './entry-form';

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

describe('CURRENCIES', () => {
  it('includes THB and the trip currencies', () => {
    expect(CURRENCIES).toContain('THB');
    expect(CURRENCIES).toContain('JPY');
  });
});

describe('parseEntryForm', () => {
  it('parses a THB expense — thb equals amount, blank time/note become null', () => {
    const result = parseEntryForm(formData(base));
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
      },
    });
  });

  it('flips the sign for income', () => {
    const result = parseEntryForm(
      formData({ ...base, direction: 'income', category: 'salary', amount: '50000', thb: '50000' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.amount).toBe(50000);
      expect(result.entry.originalAmount).toBe(50000);
    }
  });

  it('rejects an empty account', () => {
    expect(parseEntryForm(formData({ ...base, account: '' }))).toEqual({
      ok: false,
      error: 'Account is required.',
    });
  });

  it('rejects an empty category', () => {
    expect(parseEntryForm(formData({ ...base, category: '' }))).toEqual({
      ok: false,
      error: 'Category is required.',
    });
  });

  it('rejects an empty date', () => {
    expect(parseEntryForm(formData({ ...base, date: '' }))).toEqual({
      ok: false,
      error: 'Date is required.',
    });
  });

  it('rejects a currency outside the allowed set', () => {
    expect(parseEntryForm(formData({ ...base, currency: 'BTC' }))).toEqual({
      ok: false,
      error: 'Choose a valid currency.',
    });
  });

  it('rejects a non-positive or non-numeric amount', () => {
    expect(parseEntryForm(formData({ ...base, amount: '0' }))).toEqual({
      ok: false,
      error: 'Amount must be a positive number.',
    });
    expect(parseEntryForm(formData({ ...base, amount: 'abc' }))).toEqual({
      ok: false,
      error: 'Amount must be a positive number.',
    });
  });

  it('rejects a non-positive THB amount when the currency is not THB', () => {
    expect(
      parseEntryForm(formData({ ...base, currency: 'JPY', amount: '1000', thb: '0' })),
    ).toEqual({ ok: false, error: 'THB amount must be a positive number.' });
  });
});
