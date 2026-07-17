import { describe, it, expect } from 'vitest';
import {
  toBudgetRows,
  toBudgetTotal,
  suggestBudget,
  meterColorVar,
  pacePhrase,
  toBudgetFitRows,
} from './budget-status';

describe('suggestBudget', () => {
  it('rounds up to the nearest 500 for amounts ≥ ฿1,000', () => {
    expect(suggestBudget(8918)).toBe(9000);
    expect(suggestBudget(5388)).toBe(5500);
    expect(suggestBudget(1000)).toBe(1000); // already a clean step
  });

  it('rounds up to the nearest 100 for small amounts', () => {
    expect(suggestBudget(140)).toBe(200);
    expect(suggestBudget(553)).toBe(600);
  });

  it('returns null when there is no spend to base it on', () => {
    expect(suggestBudget(0)).toBeNull();
    expect(suggestBudget(-50)).toBeNull();
  });
});

describe('toBudgetTotal', () => {
  it('classifies under / near / over against the limit', () => {
    expect(toBudgetTotal(1000, 500).state).toBe('under');
    expect(toBudgetTotal(1000, 800).state).toBe('near'); // exactly the 80% threshold
    expect(toBudgetTotal(1000, 1001).state).toBe('over');
  });

  it('reports remaining as limit − spent (negative when over)', () => {
    expect(toBudgetTotal(1000, 300).remaining).toBe(700);
    expect(toBudgetTotal(1000, 1200).remaining).toBe(-200);
  });

  it('clamps the meter to 100% even when over budget', () => {
    expect(toBudgetTotal(1000, 4000).pct).toBe(100);
  });

  it('treats a missing limit as unbudgeted (no state, no remaining)', () => {
    const t = toBudgetTotal(null, 500);
    expect(t.state).toBe('none');
    expect(t.remaining).toBe(0);
    expect(t.pct).toBe(100); // spend with no budget fills the neutral bar
  });
});

describe('toBudgetRows', () => {
  const rows = toBudgetRows(
    ['Food', 'Rent', 'Fun', 'Health'],
    new Map([
      ['Food', 1000], // over
      ['Rent', 5000], // under
      ['Fun', 200], // near (160/200 = 80%)
      // Health has no budget
    ]),
    new Map([
      ['Food', 1500],
      ['Rent', 1000],
      ['Fun', 160],
      ['Health', 300], // spend with no budget → 'none'
    ]),
  );

  it('orders by spend, biggest first (stable as budgets are set)', () => {
    // spend: Food 1500, Rent 1000, Health 300, Fun 160
    expect(rows.map((r) => r.category)).toEqual(['Food', 'Rent', 'Health', 'Fun']);
  });

  it('includes a budgeted category with no spend this cycle', () => {
    const noSpend = toBudgetRows(['Idle'], new Map([['Idle', 500]]), new Map());
    expect(noSpend).toHaveLength(1);
    expect(noSpend[0]).toMatchObject({ category: 'Idle', spent: 0, state: 'under' });
  });

  it('surfaces untracked spend (spent, no budget) as its own state', () => {
    const health = rows.find((r) => r.category === 'Health');
    expect(health).toMatchObject({ limit: null, spent: 300, state: 'none' });
  });

  it('lists each category once even when it appears in every source', () => {
    expect(new Set(rows.map((r) => r.category)).size).toBe(rows.length);
  });
});

describe('meterColorVar', () => {
  it('maps over → loss, near → warn, under/none → accent', () => {
    expect(meterColorVar('over')).toBe('var(--color-loss)');
    expect(meterColorVar('near')).toBe('var(--color-warn)');
    expect(meterColorVar('under')).toBe('var(--color-accent)');
    expect(meterColorVar('none')).toBe('var(--color-accent)');
  });
});

describe('pacePhrase', () => {
  it('reports the signed gap between spend and time as under/over pace', () => {
    expect(pacePhrase(70, 77)).toBe('7% under pace');
    expect(pacePhrase(85, 77)).toBe('8% over pace');
  });

  it('reads "on pace" when spend and time round to the same point', () => {
    expect(pacePhrase(77, 77)).toBe('on pace');
    expect(pacePhrase(77.3, 77)).toBe('on pace');
  });
});

describe('toBudgetFitRows', () => {
  const WINDOW = [
    { key: '2026-05', label: 'May' },
    { key: '2026-06', label: 'Jun' },
    { key: '2026-07', label: 'Jul' },
  ];
  // cycle key → category → spend magnitude
  const MATRIX = new Map([
    ['2026-05', new Map([['Food', 900]])],
    ['2026-06', new Map([['Food', 1200]])],
    ['2026-07', new Map([['Food', 400]])],
  ]);

  it('marks a cycle over when spend exceeds the current limit', () => {
    const [row] = toBudgetFitRows(new Map([['Food', 1000]]), MATRIX, WINDOW);
    expect(row.cycles.map((c) => c.over)).toEqual([false, true, false]);
  });

  it('counts the cycles that would have held', () => {
    const [row] = toBudgetFitRows(new Map([['Food', 1000]]), MATRIX, WINDOW);
    expect(row.heldCount).toBe(2);
  });

  it('carries the window label and spend onto each cycle', () => {
    const [row] = toBudgetFitRows(new Map([['Food', 1000]]), MATRIX, WINDOW);
    expect(row.cycles).toEqual([
      { key: '2026-05', label: 'May', spent: 900, over: false },
      { key: '2026-06', label: 'Jun', spent: 1200, over: true },
      { key: '2026-07', label: 'Jul', spent: 400, over: false },
    ]);
  });

  it('treats spend exactly at the limit as held, matching the over/near model', () => {
    const [row] = toBudgetFitRows(new Map([['Food', 1200]]), MATRIX, WINDOW);
    expect(row.cycles.map((c) => c.over)).toEqual([false, false, false]);
    expect(row.heldCount).toBe(3);
  });

  it('reports a cycle with no spend in that category as zero, not a gap', () => {
    const sparse = new Map([['2026-06', new Map([['Food', 1200]])]]);
    const [row] = toBudgetFitRows(new Map([['Food', 1000]]), sparse, WINDOW);
    expect(row.cycles.map((c) => c.spent)).toEqual([0, 1200, 0]);
    expect(row.heldCount).toBe(2);
  });

  it('only includes budgeted categories — spend without a limit has nothing to fit', () => {
    const matrix = new Map([
      [
        '2026-05',
        new Map([
          ['Food', 900],
          ['Travel', 5000],
        ]),
      ],
    ]);
    const rows = toBudgetFitRows(new Map([['Food', 1000]]), matrix, WINDOW);
    expect(rows.map((r) => r.category)).toEqual(['Food']);
  });

  it('includes a budgeted category with no spend at all — it held every cycle', () => {
    const rows = toBudgetFitRows(new Map([['Gifts', 500]]), new Map(), WINDOW);
    expect(rows).toEqual([
      {
        category: 'Gifts',
        limit: 500,
        heldCount: 3,
        cycles: [
          { key: '2026-05', label: 'May', spent: 0, over: false },
          { key: '2026-06', label: 'Jun', spent: 0, over: false },
          { key: '2026-07', label: 'Jul', spent: 0, over: false },
        ],
      },
    ]);
  });

  it('ranks the worst-fitting budgets first, breaking ties by name', () => {
    const matrix = new Map([
      [
        '2026-05',
        new Map([
          ['Food', 9000],
          ['Travel', 9000],
          ['Gifts', 1],
        ]),
      ],
      [
        '2026-06',
        new Map([
          ['Food', 9000],
          ['Travel', 1],
        ]),
      ],
      [
        '2026-07',
        new Map([
          ['Food', 9000],
          ['Travel', 1],
        ]),
      ],
    ]);
    const limits = new Map([
      ['Food', 100],
      ['Travel', 100],
      ['Gifts', 100],
    ]);
    const rows = toBudgetFitRows(limits, matrix, WINDOW);
    // Food held 0, Travel held 2, Gifts held 3.
    expect(rows.map((r) => [r.category, r.heldCount])).toEqual([
      ['Food', 0],
      ['Travel', 2],
      ['Gifts', 3],
    ]);
  });

  it('breaks a genuine tie by category name', () => {
    // Both categories hold exactly 1 of 3 cycles, so heldCount cannot order them — only the name
    // can. `limits` inserts Zebra FIRST, so a passing result also proves the sort does not leak
    // Map insertion order.
    const matrix = new Map([
      [
        '2026-05',
        new Map([
          ['Zebra', 5000],
          ['Apple', 5000],
        ]),
      ],
      [
        '2026-06',
        new Map([
          ['Zebra', 5000],
          ['Apple', 5000],
        ]),
      ],
      [
        '2026-07',
        new Map([
          ['Zebra', 10],
          ['Apple', 10],
        ]),
      ],
    ]);
    const limits = new Map([
      ['Zebra', 100],
      ['Apple', 100],
    ]);
    const rows = toBudgetFitRows(limits, matrix, WINDOW);
    expect(rows.map((r) => [r.category, r.heldCount])).toEqual([
      ['Apple', 1],
      ['Zebra', 1],
    ]);
  });
});
