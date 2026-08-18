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

  it('drops inflows by default, so a Monefy export cannot import its income categories', () => {
    const csv = `${header}
14/08/2026,Cash,Food,-2000,THB,-2000,THB,
14/08/2026,Cash,Salary,30000,THB,30000,THB,`;
    const { entries, skipped } = parseMonefyCsv(csv);
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('keeps inflows when asked, so a moniflow backup restores its refunds', () => {
    const csv = `${header}
14/08/2026,Card,Food,-2000,THB,-2000,THB,
14/08/2026,Cash,Food,500,THB,500,THB,`;
    const { entries, skipped } = parseMonefyCsv(csv, { keepInflows: true });
    expect(entries.map((e) => e.amount)).toEqual([-2000, 500]);
    expect(skipped).toBe(0);
  });

  it('round-trips a refund through serialize and parse', () => {
    // The bug this guards: serializeMonefyCsv writes +500 correctly, parseMonefyCsv used to eat it,
    // so export -> restore lost every refund with no error anywhere.
    const rows = [
      {
        date: '2026-08-14',
        account: 'Card',
        category: 'Food',
        amount: -2000,
        currency: 'THB',
        originalAmount: -2000,
        note: null,
        offBudget: null,
        source: 'manual',
      },
      {
        date: '2026-08-14',
        account: 'Cash',
        category: 'Food',
        amount: 500,
        currency: 'THB',
        originalAmount: 500,
        note: null,
        offBudget: null,
        source: 'manual',
      },
    ];
    const back = parseMonefyCsv(serializeMonefyCsv(rows), { keepInflows: true }).entries;
    expect(back.map((e) => e.amount)).toEqual([-2000, 500]);
  });
});

describe('serializeMonefyCsv', () => {
  it('emits the eight Monefy columns plus the off_budget and source columns moniflow appends', () => {
    expect(serializeMonefyCsv([])).toBe(MONEFY_HEADER);
    expect(MONEFY_HEADER).toBe(
      'date,account,category,amount,currency,converted amount,currency,description,off_budget,source',
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
        source: 'manual',
      },
    ]);
    expect(csv.split('\n')[1]).toBe(
      '15/01/2016,#KTC X VISA,shopping,-637,THB,-637,THB,lotus,,manual',
    );
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
        source: 'manual',
      },
    ]);
    expect(csv.split('\n')[1]).toBe('20/03/2019,yen,food,-1000,JPY,-230,THB,,,manual');
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
        source: 'manual',
      },
    ]);
    expect(csv.split('\n')[1]).toBe(
      '01/07/2026,cash,food,-50,THB,-50,THB,"lunch, with ""friends""",,manual',
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
        source: 'manual',
      },
    ]);
    expect(csv.split('\n')[1]).toBe('02/07/2026,cash,food,-12,THB,-12,THB,,,manual');
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
        source: 'monefy',
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
        source: 'manual',
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
        source: 'manual',
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
    source: 'manual',
  });

  it('emits off_budget as the 9th column: empty for null, 0 and 1 for the forced states', () => {
    expect(MONEFY_HEADER).toBe(
      'date,account,category,amount,currency,converted amount,currency,description,off_budget,source',
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

// `source` used to be deliberately left out of the format ("no column in Monefy's format"). Once a
// fixed cost became a source='recurring' row that comes off the BUDGET, dropping it stopped being a
// fidelity footnote and became data loss: restore onto a fresh device — the exact case a backup
// exists for — and every bill silently reverts to discretionary spend, snapping the ceiling back up.
// Same failure the off_budget column above was added to close.
describe('source survives the CSV round-trip', () => {
  const row = (source: string) => ({
    date: '2026-07-27',
    account: 'cash',
    category: 'บิลรายเดือน',
    amount: -1720,
    currency: 'THB',
    originalAmount: -1720,
    note: 'ค่าไฟ',
    offBudget: null,
    source,
  });

  it('emits source as the 10th column', () => {
    expect(MONEFY_HEADER).toBe(
      'date,account,category,amount,currency,converted amount,currency,description,off_budget,source',
    );
    const cols = (source: string) =>
      serializeMonefyCsv([row(source)])
        .split('\n')[1]
        .split(',');
    expect(cols('recurring')[9]).toBe('recurring');
    expect(cols('manual')[9]).toBe('manual');
  });

  it('parses the 10th column back, keeping a fixed bill fixed', () => {
    for (const source of ['manual', 'monefy', 'recurring']) {
      const { entries } = parseMonefyCsv(serializeMonefyCsv([row(source)]));
      expect(entries[0].source).toBe(source);
    }
  });

  // A genuine Monefy export stops at 8 columns and knows nothing of either extension. It is an
  // IMPORT, so its rows are 'monefy' — the same default the parser always applied.
  it('reads a genuine 8-column Monefy CSV as source monefy', () => {
    const csv =
      'date,account,category,amount,currency,converted amount,currency,description\n' +
      '15/01/2016,cash,shopping,-637,THB,-637,THB,lotus';
    expect(parseMonefyCsv(csv).entries[0].source).toBe('monefy');
  });

  // A moniflow backup written before this column existed: 9 columns, no source. Those rows predate
  // the fixed-cost feature, so 'monefy' is as good a guess as any — what matters is that a missing
  // column never reads as 'recurring' and starts silently shrinking someone's budget.
  it('reads a 9-column moniflow backup without inventing a fixed cost', () => {
    const csv =
      'date,account,category,amount,currency,converted amount,currency,description,off_budget\n' +
      '15/01/2016,cash,shopping,-637,THB,-637,THB,lotus,1';
    const entry = parseMonefyCsv(csv).entries[0];
    expect(entry.source).not.toBe('recurring');
    expect(entry.offBudget).toBe(1); // the 9th column still reads correctly beside the new one
  });
});
