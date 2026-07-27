import { describe, it, expect } from 'vitest';
import { parseCsv, parseMonefyCsv, SKIP_CATEGORIES } from './import';
import { serializeMonefyCsv, MONEFY_HEADER } from './import';

describe('parseCsv', () => {
  it('splits simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields and strips the quotes', () => {
    expect(parseCsv('x,"12,000",y')).toEqual([['x', '12,000', 'y']]);
  });

  it('handles a trailing empty field and ignores blank lines', () => {
    expect(parseCsv('a,b,\n\n')).toEqual([['a', 'b', '']]);
  });
});

describe('parseMonefyCsv', () => {
  const header = 'date,account,category,amount,currency,converted amount,currency,description';

  it('maps a THB outflow row: DD/MM/YYYY date, cleaned amount, note', () => {
    const csv = `${header}\n15/01/2016,#KTC X VISA,ช็อปปิ้ง,-637,THB,-637,THB,โลตัส`;
    const { entries, skipped } = parseMonefyCsv(csv);
    expect(skipped).toBe(0);
    expect(entries).toEqual([
      {
        date: '2016-01-15',
        account: '#KTC X VISA',
        category: 'ช็อปปิ้ง',
        amount: -637,
        currency: 'THB',
        originalAmount: -637,
        note: 'โลตัส',
        source: 'monefy',
        offBudget: null, // 8-column Monefy CSV has no such column → inherit the category
      },
    ]);
  });

  it('strips thousands commas and leaves an empty note as null', () => {
    const csv = `${header}\n16/01/2016,#KTC X VISA,รักษาพยาบาล,"-3,960",THB,"-3,960",THB,`;
    const [row] = parseMonefyCsv(csv).entries;
    expect(row.amount).toBe(-3960);
    expect(row.note).toBeNull();
  });

  it('keeps original currency + amount for a non-THB row', () => {
    const csv = `${header}\n20/03/2019,เงินเยน,เยน อาหาร,-1000,JPY,-230,THB,ramen`;
    const [row] = parseMonefyCsv(csv).entries;
    expect(row.currency).toBe('JPY');
    expect(row.originalAmount).toBe(-1000);
    expect(row.amount).toBe(-230);
  });

  it('skips credit-card-payment and initial-balance rows', () => {
    const csv =
      `${header}\n` +
      `16/01/2016,#KTC X VISA,บัตรเครดิท,"12,000",THB,"12,000",THB,\n` +
      `01/01/2016,เงินเยน,Initial balance 'เงินเยน',5000,THB,5000,THB,`;
    const { entries, skipped } = parseMonefyCsv(csv);
    expect(entries).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it('skips income (inflow) rows — a spending tracker keeps expenses only', () => {
    const csv =
      `${header}\n` +
      `25/01/2016,#Cash,เงินสด,5000,THB,5000,THB,salary\n` +
      `26/01/2016,#Cash,ช็อปปิ้ง,-100,THB,-100,THB,`;
    const { entries, skipped } = parseMonefyCsv(csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('ช็อปปิ้ง');
    expect(skipped).toBe(1);
  });

  it('exposes the skip list for review', () => {
    expect(SKIP_CATEGORIES).toContain('บัตรเครดิท');
  });
});

describe('serializeMonefyCsv', () => {
  it('emits the eight Monefy columns plus the off_budget column moniflow appends', () => {
    expect(serializeMonefyCsv([])).toBe(MONEFY_HEADER);
    expect(MONEFY_HEADER).toBe(
      'date,account,category,amount,currency,converted amount,currency,description,off_budget',
    );
  });

  it('serializes a THB outflow: DD/MM/YYYY date, THB in both currency cols, note last', () => {
    const csv = serializeMonefyCsv([
      {
        date: '2016-01-15',
        account: '#KTC X VISA',
        category: 'shopping',
        amount: -637,
        currency: 'THB',
        originalAmount: -637,
        note: 'lotus',
        offBudget: null,
      },
    ]);
    expect(csv.split('\n')[1]).toBe('15/01/2016,#KTC X VISA,shopping,-637,THB,-637,THB,lotus,');
  });

  it('keeps the original currency + amount for a non-THB row (converted stays THB)', () => {
    const csv = serializeMonefyCsv([
      {
        date: '2019-03-20',
        account: 'yen',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
        note: null,
        offBudget: null,
      },
    ]);
    expect(csv.split('\n')[1]).toBe('20/03/2019,yen,food,-1000,JPY,-230,THB,,');
  });

  it('quotes a field that contains a comma and doubles embedded quotes', () => {
    const csv = serializeMonefyCsv([
      {
        date: '2026-07-01',
        account: 'cash',
        category: 'food',
        amount: -50,
        currency: 'THB',
        originalAmount: -50,
        note: 'lunch, with "friends"',
        offBudget: null,
      },
    ]);
    expect(csv.split('\n')[1]).toBe(
      '01/07/2026,cash,food,-50,THB,-50,THB,"lunch, with ""friends""",',
    );
  });

  it('falls back to THB currency and amount when original fields are null', () => {
    const csv = serializeMonefyCsv([
      {
        date: '2026-07-02',
        account: 'cash',
        category: 'food',
        amount: -12,
        currency: null,
        originalAmount: null,
        note: null,
        offBudget: null,
      },
    ]);
    expect(csv.split('\n')[1]).toBe('02/07/2026,cash,food,-12,THB,-12,THB,,');
  });
});

describe('serialize ↔ parse round-trip', () => {
  it('parseMonefyCsv(serializeMonefyCsv(rows)) recovers the entry fields', () => {
    const rows = [
      {
        date: '2016-01-15',
        account: '#KTC X VISA',
        category: 'shopping',
        amount: -637,
        currency: 'THB',
        originalAmount: -637,
        note: 'lotus',
        offBudget: 1,
      },
      {
        date: '2019-03-20',
        account: 'yen',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
        note: null,
        offBudget: null,
      },
    ];
    const { entries } = parseMonefyCsv(serializeMonefyCsv(rows));
    expect(entries).toEqual([
      {
        date: '2016-01-15',
        account: '#KTC X VISA',
        category: 'shopping',
        amount: -637,
        currency: 'THB',
        originalAmount: -637,
        note: 'lotus',
        source: 'monefy',
        offBudget: 1,
      },
      {
        date: '2019-03-20',
        account: 'yen',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
        note: null,
        source: 'monefy',
        offBudget: null,
      },
    ]);
  });
});

describe('off_budget survives the CSV round-trip', () => {
  const row = (offBudget: number | null) => ({
    date: '2026-07-27',
    account: 'cash',
    category: 'insurance',
    amount: -500,
    currency: 'THB',
    originalAmount: -500,
    note: 'yearly',
    offBudget,
  });

  it('emits off_budget as the 9th column: empty for null, 0 and 1 for the forced states', () => {
    expect(MONEFY_HEADER).toBe(
      'date,account,category,amount,currency,converted amount,currency,description,off_budget',
    );
    const cols = (offBudget: number | null) =>
      serializeMonefyCsv([row(offBudget)])
        .split('\n')[1]
        .split(',');
    expect(cols(null)[8]).toBe('');
    expect(cols(0)[8]).toBe('0');
    expect(cols(1)[8]).toBe('1');
  });

  it('parses the 9th column back to the null | 0 | 1 tri-state', () => {
    for (const offBudget of [null, 0, 1]) {
      const { entries } = parseMonefyCsv(serializeMonefyCsv([row(offBudget)]));
      expect(entries[0].offBudget).toBe(offBudget);
    }
  });

  // A real Monefy export has 8 columns and no such concept. Missing must mean "inherit the
  // category" (null), never "force on-budget" (0) — the two behave differently in the meters.
  it('reads a genuine 8-column Monefy CSV as null, not 0', () => {
    const csv =
      'date,account,category,amount,currency,converted amount,currency,description\n' +
      '15/01/2016,cash,shopping,-637,THB,-637,THB,lotus';
    expect(parseMonefyCsv(csv).entries[0].offBudget).toBeNull();
  });
});
