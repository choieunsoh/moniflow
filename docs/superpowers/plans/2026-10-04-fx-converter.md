# FX Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/convert` page that converts an amount between two catalog currencies and shows the
result per 1 unit and for the amount entered, at +0/+1/+2/+2.5% exchange fee.

**Architecture:** All arithmetic sits in one pure module (`features/currencies/convert.ts`) that
reuses `withFee` from `features/entries/fx.ts`. A `withDb` read hook loads the catalog, the cached
ECB rates and the card fee. A controlled presentational component renders the table. The route owns
the URL state (`?from=&to=&amt=`). No schema change, no new fetch.

**Tech Stack:** Next.js 16 App Router (static export, `'use client'`), React 19, TypeScript strict,
Vitest + Testing Library (jsdom, Node sqlite shim), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-04-fx-converter-design.md`

## Global Constraints

- Shell commands run in **Git Bash** (POSIX syntax), never PowerShell.
- TS rules (lint errors): no `any`, no `as` casts (`as const` OK), no `!` non-null, no ts-comments,
  `type` over `interface`, `for..of` over `forEach`.
- Fee rule: `thbPerUnit_eff = code === 'THB' ? 1 : mid × (1 + fee/100)`; rate = eff(from) / eff(to).
- Fee rows `[0, 1, 2, 2.5]` show **only when exactly one side is THB**; otherwise a single 0% row.
- ★ marks the row whose fee equals `getCardFeePct(db)`. There is no ★ when no row matches.
- Per-1 column 4 dp; total column in the destination currency's own minor units.
- Figures use the `tnum` class (system sans + tabular-nums), never a monospace font.
- Only **visible** catalog currencies (`listCurrencies`) are offered.
- A missing rate shows "No rate for XXX yet" plus Refresh. Never print an invented number.
- Commits: `git commit -m "type(scope): subject" -m "body"`. No `-F`, no heredoc, no
  `Claude-Session`/`Co-Authored-By` trailers. Scopes: `features`, `app`, `shared`, `docs`.
- Work happens on the existing branch `feat/fx-converter`.
- Gates before each commit: `npm run format:files <changed files>`, then `npm run typecheck`,
  `npm run lint`, `npm run format:check`, `npm test`.

## File map

| File | Responsibility |
| --- | --- |
| Create `src/features/currencies/convert.ts` | Pure: `FEE_STEPS`, `parseAmount`, `resolvePair`, `convertRows`, `rateDate` |
| Create `src/features/currencies/convert.test.ts` | Arithmetic + defaults |
| Create `src/features/currencies/use-convert.ts` | Read hook: codes + rates + card fee |
| Create `src/features/currencies/use-convert.test.ts` | `renderHook` against the Node shim |
| Create `src/features/currencies/ui/Converter.tsx` | Controlled UI: amount, pickers, swap, table, ★, refresh |
| Create `src/features/currencies/ui/Converter.test.tsx` | Rows, ★, cross pair, swap, missing rate |
| Create `src/app/convert/page.tsx` | Route: URL state ↔ Converter |
| Modify `src/shared/ui/MoreSheet.tsx` | Convert tile in the **Plan** group |
| Modify `src/shared/ui/MoreSheet.test.tsx` | Expected href list |
| Modify `src/app/manifest.ts` + `manifest.test.ts` | Launcher shortcut |
| Modify the spec | Record the More-sheet placement change (Plan, not Lists) |

**Placement change from the spec:** the spec put the tile "right after Currency" in Lists. Lists is
exactly one row of three (`MoreSheet.tsx` comment: an orphan tile "reads as a hole"), while Plan is a
short row of two. Convert goes into **Plan after Recurring**, which fills that row. The spec is
updated in Task 4.

---

### Task 1: Pure conversion module

**Files:**
- Create: `src/features/currencies/convert.ts`
- Test: `src/features/currencies/convert.test.ts`

**Interfaces:**
- Consumes: `withFee(baseRate: number, feePct: number): number` from `@features/entries/fx`;
  `type FxRates = Record<string, { thbPerUnit: number; asOf: string }>` from `@features/settings/queries`.
- Produces:
  - `FEE_STEPS: readonly [0, 1, 2, 2.5]`
  - `type ConvertRow = { feePct: number; perUnit: number; total: number | null }`
  - `type ConvertResult = { kind: 'ok'; rows: ConvertRow[] } | { kind: 'missing'; code: string }`
  - `parseAmount(raw: string): number | null`
  - `resolvePair(codes: readonly string[], fromParam: string | null, toParam: string | null): { from: string; to: string } | null`
  - `convertRows(amount: number | null, from: string, to: string, rates: FxRates): ConvertResult`
  - `rateDate(from: string, to: string, rates: FxRates): string | null`

- [ ] **Step 1: Write the failing test**

`src/features/currencies/convert.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { FxRates } from '@features/settings/queries';
import { FEE_STEPS, parseAmount, resolvePair, convertRows, rateDate } from './convert';

const rates: FxRates = {
  JPY: { thbPerUnit: 0.22, asOf: '2026-10-02' },
  USD: { thbPerUnit: 33, asOf: '2026-10-03' },
};

function okRows(amount: number | null, from: string, to: string) {
  const result = convertRows(amount, from, to, rates);
  if (result.kind !== 'ok') throw new Error(`expected ok, got missing ${result.code}`);
  return result.rows;
}

describe('parseAmount', () => {
  it('accepts plain and comma-grouped decimals', () => {
    expect(parseAmount('1200')).toBe(1200);
    expect(parseAmount('1,200.50')).toBe(1200.5);
  });

  it('rejects empty, zero, negative and junk', () => {
    for (const raw of ['', '   ', '0', '-5', 'abc', '1.2.3']) expect(parseAmount(raw)).toBeNull();
  });
});

describe('resolvePair', () => {
  const codes = ['THB', 'JPY', 'USD'];

  it('defaults to the first foreign currency into THB', () => {
    expect(resolvePair(codes, null, null)).toEqual({ from: 'JPY', to: 'THB' });
  });

  it('keeps valid params and replaces unknown ones', () => {
    expect(resolvePair(codes, 'USD', 'JPY')).toEqual({ from: 'USD', to: 'JPY' });
    expect(resolvePair(codes, 'XXX', 'YYY')).toEqual({ from: 'JPY', to: 'THB' });
  });

  it('has nothing to convert when THB is the only currency', () => {
    expect(resolvePair(['THB'], null, null)).toBeNull();
  });
});

describe('convertRows', () => {
  it('foreign → THB: the fee raises the baht you pay', () => {
    const rows = okRows(1000, 'JPY', 'THB');
    expect(rows.map((r) => r.feePct)).toEqual([...FEE_STEPS]);
    expect(rows[0].perUnit).toBeCloseTo(0.22, 10);
    expect(rows[0].total).toBeCloseTo(220, 10);
    expect(rows[3].perUnit).toBeCloseTo(0.2255, 10);
    expect(rows[3].total).toBeCloseTo(225.5, 10);
  });

  it('THB → foreign: the fee lowers the foreign amount you get', () => {
    const rows = okRows(10000, 'THB', 'JPY');
    expect(rows[0].total).toBeCloseTo(10000 / 0.22, 6);
    expect(rows[3].total).toBeCloseTo(10000 / 0.2255, 6);
    expect(rows[3].total ?? 0).toBeLessThan(rows[0].total ?? 0);
  });

  it('cross pair: a single mid-rate row', () => {
    const rows = okRows(100, 'USD', 'JPY');
    expect(rows).toHaveLength(1);
    expect(rows[0].feePct).toBe(0);
    expect(rows[0].perUnit).toBeCloseTo(33 / 0.22, 10);
  });

  it('same currency: a single 1:1 row', () => {
    const rows = okRows(5, 'JPY', 'JPY');
    expect(rows).toEqual([{ feePct: 0, perUnit: 1, total: 5 }]);
  });

  it('no amount: per-unit only, totals null', () => {
    for (const r of okRows(null, 'JPY', 'THB')) expect(r.total).toBeNull();
  });

  it('reports a missing rate instead of inventing one', () => {
    expect(convertRows(1, 'KRW', 'THB', rates)).toEqual({ kind: 'missing', code: 'KRW' });
    expect(convertRows(1, 'THB', 'KRW', rates)).toEqual({ kind: 'missing', code: 'KRW' });
  });
});

describe('rateDate', () => {
  it('uses the foreign side, the source when both are foreign', () => {
    expect(rateDate('JPY', 'THB', rates)).toBe('2026-10-02');
    expect(rateDate('THB', 'USD', rates)).toBe('2026-10-03');
    expect(rateDate('USD', 'JPY', rates)).toBe('2026-10-03');
    expect(rateDate('THB', 'THB', rates)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/currencies/convert.test.ts`
Expected: FAIL. The suite cannot resolve `./convert`.

- [ ] **Step 3: Write the implementation**

`src/features/currencies/convert.ts`:

```ts
import { withFee } from '@features/entries/fx';
import type { FxRates } from '@features/settings/queries';

// The /convert page's arithmetic. Every rate goes through THB because that is all the cache holds
// (THB per 1 unit, ECB mid). The fee always makes the FOREIGN currency dearer in baht — the same
// convention as the keypad's withFee — so one rule covers both use cases: JPY→THB pays more baht,
// THB→JPY receives fewer yen. With no THB side (or THB on both) the fee would land on both sides and
// cancel, so those pairs get a single mid-rate row instead of four identical ones.
export const FEE_STEPS = [0, 1, 2, 2.5] as const;

export type ConvertRow = { feePct: number; perUnit: number; total: number | null };
export type ConvertResult = { kind: 'ok'; rows: ConvertRow[] } | { kind: 'missing'; code: string };

// A typed amount, or null when there is nothing to multiply. Number('') is 0, so the > 0 check also
// rejects blanks; Number('1.2.3') is NaN.
export function parseAmount(raw: string): number | null {
  const n = Number(raw.replaceAll(',', ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// URL params → a valid pair. Unknown codes fall back: `to` to THB, `from` to the first foreign
// catalog currency. null = the catalog has no foreign currency at all.
export function resolvePair(
  codes: readonly string[],
  fromParam: string | null,
  toParam: string | null,
): { from: string; to: string } | null {
  const fallbackFrom = codes.find((c) => c !== 'THB');
  if (fallbackFrom === undefined) return null;
  const from = fromParam !== null && codes.includes(fromParam) ? fromParam : fallbackFrom;
  const to = toParam !== null && codes.includes(toParam) ? toParam : 'THB';
  return { from, to };
}

function midThb(code: string, rates: FxRates): number | undefined {
  return code === 'THB' ? 1 : rates[code]?.thbPerUnit;
}

export function convertRows(
  amount: number | null,
  from: string,
  to: string,
  rates: FxRates,
): ConvertResult {
  const fromMid = midThb(from, rates);
  if (fromMid === undefined) return { kind: 'missing', code: from };
  const toMid = midThb(to, rates);
  if (toMid === undefined) return { kind: 'missing', code: to };

  const fees = (from === 'THB') !== (to === 'THB') ? FEE_STEPS : [0];
  const eff = (code: string, mid: number, fee: number) => (code === 'THB' ? 1 : withFee(mid, fee));
  const rows: ConvertRow[] = [];
  for (const feePct of fees) {
    const perUnit = eff(from, fromMid, feePct) / eff(to, toMid, feePct);
    rows.push({ feePct, perUnit, total: amount === null ? null : amount * perUnit });
  }
  return { kind: 'ok', rows };
}

// The ECB fixing date to caption the table with: the foreign side's, the source's when both are.
export function rateDate(from: string, to: string, rates: FxRates): string | null {
  const code = from === 'THB' ? to : from;
  return rates[code]?.asOf ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/currencies/convert.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Gates and commit**

```bash
npm run format:files src/features/currencies/convert.ts src/features/currencies/convert.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/currencies/convert.ts src/features/currencies/convert.test.ts
git commit -m "feat(features): add the pure FX converter arithmetic" -m "convertRows routes every pair through the cached THB-per-unit mid rate and layers the card fee with withFee, so a foreign currency always gets dearer in baht. Fee rows only when exactly one side is THB; a missing rate is reported, never invented."
```

---

### Task 2: Read hook

**Files:**
- Create: `src/features/currencies/use-convert.ts`
- Test: `src/features/currencies/use-convert.test.ts`

**Interfaces:**
- Consumes: `listCurrencies(db)` (`./queries`), `getFxRates(db)`, `getCardFeePct(db)`
  (`@features/settings/queries`), `withDb` (`@shared/db-effect`), `useDataVersion` (`@shared/data-version`).
- Produces: `type ConvertData = { codes: string[]; rates: FxRates; cardFeePct: number }` and
  `useConvert(): { ready: boolean; data: ConvertData | null }`.

- [ ] **Step 1: Write the failing test**

`src/features/currencies/use-convert.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureCurrenciesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { setFxRates, setCardFeePct } from '@features/settings/queries';
import { setCurrencyArchived } from './queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useConvert } from './use-convert';

describe('useConvert', () => {
  let db: Db;

  beforeEach(async () => {
    db = makeNodeProxyDb();
    await ensureCurrenciesTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then returns visible codes, rates and the card fee', async () => {
    await setFxRates(db, { JPY: { thbPerUnit: 0.22, asOf: '2026-10-02' } });
    await setCardFeePct(db, 2);
    const { result } = renderHook(() => useConvert());
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.codes[0]).toBe('THB');
    expect(result.current.data?.codes).toContain('JPY');
    expect(result.current.data?.rates.JPY?.thbPerUnit).toBe(0.22);
    expect(result.current.data?.cardFeePct).toBe(2);
  });

  it('leaves out archived currencies', async () => {
    const first = renderHook(() => useConvert());
    await waitFor(() => expect(first.result.current.ready).toBe(true)); // seeds the catalog
    await setCurrencyArchived(db, 'MOP', true);
    const { result } = renderHook(() => useConvert());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.codes).not.toContain('MOP');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/currencies/use-convert.test.ts`
Expected: FAIL. The suite cannot resolve `./use-convert`.

- [ ] **Step 3: Write the implementation**

`src/features/currencies/use-convert.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { useDataVersion } from '@shared/data-version';
import { getCardFeePct, getFxRates, type FxRates } from '@features/settings/queries';
import { listCurrencies } from './queries';

export type ConvertData = { codes: string[]; rates: FxRates; cardFeePct: number };

// The /convert page's data: the visible catalog (what the pickers offer), the cached ECB mid rates,
// and the user's real card fee (which row gets the ★). Refetches on the data version, so the page's
// Refresh — refreshFxRatesAction bumps it — updates the table in place. Not setReady(false) on
// refetch, for the same reason as use-currencies.ts: a refresh must not blank the page.
export function useConvert(): { ready: boolean; data: ConvertData | null } {
  const [data, setData] = useState<ConvertData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      const [catalog, rates, cardFeePct] = await Promise.all([
        listCurrencies(db),
        getFxRates(db),
        getCardFeePct(db),
      ]);
      setData({ codes: catalog.map((r) => r.code), rates, cardFeePct });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/currencies/use-convert.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Gates and commit**

```bash
npm run format:files src/features/currencies/use-convert.ts src/features/currencies/use-convert.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/currencies/use-convert.ts src/features/currencies/use-convert.test.ts
git commit -m "feat(features): add the useConvert read hook" -m "Loads the visible catalog, the cached ECB rates and the card fee for /convert through withDb, refetching on the data version so a rate refresh updates the table in place."
```

---

### Task 3: Converter component

**Files:**
- Create: `src/features/currencies/ui/Converter.tsx`
- Test: `src/features/currencies/ui/Converter.test.tsx`

**Interfaces:**
- Consumes: `convertRows`, `parseAmount`, `rateDate` (Task 1); `type FxRates`;
  `formatCurrency`, `currencySymbol` (`@shared/money`); `formatDayHeadingWithYear` (`@shared/date`).
- Produces:
  ```ts
  export type ConverterProps = {
    codes: readonly string[];
    rates: FxRates;
    cardFeePct: number;
    from: string;
    to: string;
    amount: string; // raw text as typed
    onAmount: (raw: string) => void;
    onPair: (from: string, to: string) => void;
    onRefresh: () => Promise<void>;
  };
  export function Converter(props: ConverterProps): JSX.Element
  ```
  It is fully controlled and does no I/O, so the route owns the URL and the action.

- [ ] **Step 1: Write the failing test**

`src/features/currencies/ui/Converter.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { FxRates } from '@features/settings/queries';
import { Converter, type ConverterProps } from './Converter';

const rates: FxRates = {
  JPY: { thbPerUnit: 0.22, asOf: '2026-10-02' },
  USD: { thbPerUnit: 33, asOf: '2026-10-03' },
};

function setup(overrides: Partial<ConverterProps> = {}) {
  const props: ConverterProps = {
    codes: ['THB', 'JPY', 'USD', 'KRW'],
    rates,
    cardFeePct: 2.5,
    from: 'JPY',
    to: 'THB',
    amount: '1000',
    onAmount: vi.fn(),
    onPair: vi.fn(),
    onRefresh: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  render(<Converter {...props} />);
  return props;
}

function bodyRows(): HTMLTableRowElement[] {
  return [...document.querySelectorAll('tbody tr')].filter(
    (r): r is HTMLTableRowElement => r instanceof HTMLTableRowElement,
  );
}

describe('Converter', () => {
  it('shows four fee rows with per-unit and total figures', () => {
    setup();
    const rows = bodyRows();
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('+0%');
    expect(rows[0].textContent).toContain('฿0.2200');
    expect(rows[0].textContent).toContain('฿220.00');
    expect(rows[3].textContent).toContain('+2.5%');
    expect(rows[3].textContent).toContain('฿225.50');
  });

  it('stars the row matching the card fee, and none when nothing matches', () => {
    setup();
    expect(bodyRows()[3].querySelector('[aria-label="your card fee"]')).not.toBeNull();
    cleanup();
    setup({ cardFeePct: 1.5 });
    expect(document.querySelector('[aria-label="your card fee"]')).toBeNull();
  });

  it('shows a single mid-rate row for a cross pair', () => {
    setup({ from: 'USD', to: 'JPY' });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText(/card fees apply in baht/i)).toBeTruthy();
  });

  it('hides the total column without a valid amount', () => {
    setup({ amount: '' });
    expect(bodyRows()[0].querySelectorAll('td')).toHaveLength(2);
  });

  it('swaps the pair', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /swap/i }));
    expect(props.onPair).toHaveBeenCalledWith('THB', 'JPY');
  });

  it('says a rate is missing instead of printing numbers', () => {
    setup({ from: 'KRW' });
    expect(screen.getByText('No rate for KRW yet')).toBeTruthy();
    expect(bodyRows()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/currencies/ui/Converter.test.tsx`
Expected: FAIL. The suite cannot resolve `./Converter`.

- [ ] **Step 3: Write the implementation**

`src/features/currencies/ui/Converter.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import type { FxRates } from '@features/settings/queries';
import { currencySymbol, formatCurrency } from '@shared/money';
import { formatDayHeadingWithYear } from '@shared/date';
import { convertRows, parseAmount, rateDate } from '../convert';

export type ConverterProps = {
  codes: readonly string[];
  rates: FxRates;
  cardFeePct: number;
  from: string;
  to: string;
  amount: string;
  onAmount: (raw: string) => void;
  onPair: (from: string, to: string) => void;
  onRefresh: () => Promise<void>;
};

const feeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
// Per-1 rates need 4 dp in every currency (฿0.2210 would read ฿0.22 at the currency default).
const perUnitFormatters = new Map<string, Intl.NumberFormat>();
function formatPerUnit(value: number, currency: string): string {
  let fmt = perUnitFormatters.get(currency);
  if (fmt === undefined) {
    fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
    perUnitFormatters.set(currency, fmt);
  }
  return fmt.format(value);
}

const selectClass = 'min-h-11 w-full rounded-[var(--radius-sm)] border px-3 py-2 text-base';
const fieldStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' };

// Controlled view for /convert: the route owns from/to/amount (URL) and the refresh action; this
// only renders. The four fee rows are "what if"; ★ marks the one your card actually charges.
export function Converter(props: ConverterProps) {
  const { codes, rates, cardFeePct, from, to, amount, onAmount, onPair, onRefresh } = props;
  const [refreshing, setRefreshing] = useState(false);
  const value = parseAmount(amount);
  const result = convertRows(value, from, to, rates);
  const asOf = rateDate(from, to, rates);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="panel flex flex-col gap-4 p-5">
      <input
        type="text"
        inputMode="decimal"
        aria-label="Amount"
        placeholder="Amount"
        className={`${selectClass} tnum`}
        style={fieldStyle}
        value={amount}
        onChange={(e) => onAmount(e.currentTarget.value)}
      />

      <div className="flex items-center gap-2">
        <select
          aria-label="From currency"
          className={selectClass}
          style={fieldStyle}
          value={from}
          onChange={(e) => onPair(e.currentTarget.value, to)}
        >
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Swap currencies"
          className="btn btn-ghost tap shrink-0"
          onClick={() => onPair(to, from)}
        >
          <ArrowLeftRight aria-hidden size={18} />
        </button>
        <select
          aria-label="To currency"
          className={selectClass}
          style={fieldStyle}
          value={to}
          onChange={(e) => onPair(from, e.currentTarget.value)}
        >
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div
        className="flex items-center justify-between gap-3 text-xs"
        style={{ color: 'var(--color-muted)' }}
      >
        <span>{asOf === null ? 'No cached rate' : `ECB rate · ${formatDayHeadingWithYear(asOf)}`}</span>
        <button
          type="button"
          className="btn btn-ghost tap flex items-center gap-1 text-xs"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw aria-hidden size={14} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {result.kind === 'missing' ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No rate for {result.code} yet
        </p>
      ) : (
        <>
          <table className="tnum w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--color-muted)' }}>
                <th className="py-1 text-left font-normal">Fee</th>
                <th className="py-1 text-right font-normal">per {currencySymbol(from)}1</th>
                {value !== null && (
                  <th className="py-1 text-right font-normal">{formatCurrency(value, from)}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.feePct} className="border-t">
                  <td className="py-2">
                    +{feeFmt.format(row.feePct)}%
                    {row.feePct === cardFeePct && result.rows.length > 1 && (
                      <span
                        aria-label="your card fee"
                        title="Your card fee (Settings)"
                        className="ml-1"
                        style={{ color: 'var(--action)' }}
                      >
                        ★
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">{formatPerUnit(row.perUnit, to)}</td>
                  {row.total !== null && (
                    <td className="py-2 text-right font-medium">{formatCurrency(row.total, to)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {result.rows.length === 1 && from !== to && (
            <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
              Mid rate — card fees apply in baht
            </p>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/currencies/ui/Converter.test.tsx`
Expected: PASS, 6 tests. If `formatCurrency(220, 'THB')` renders something other than `฿220.00`,
check `formatterFor` in `src/shared/money.ts` and adjust the **test's expected string** to what
Intl produces. Do not change `money.ts`.

- [ ] **Step 5: Gates and commit**

```bash
npm run format:files src/features/currencies/ui/Converter.tsx src/features/currencies/ui/Converter.test.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/currencies/ui/Converter.tsx src/features/currencies/ui/Converter.test.tsx
git commit -m "feat(features): add the Converter view" -m "Controlled amount + from/to pickers + swap, a fee table at 0/1/2/2.5% with a star on the user's real card fee, a single mid-rate row for cross pairs, and a no-rate state instead of invented numbers."
```

---

### Task 4: Route, More tile, launcher shortcut, browser check

**Files:**
- Create: `src/app/convert/page.tsx`
- Modify: `src/shared/ui/MoreSheet.tsx` (lucide import list; `plan` group links)
- Modify: `src/shared/ui/MoreSheet.test.tsx` (expected hrefs)
- Modify: `src/app/manifest.ts:30` (`shortcuts`)
- Modify: `src/app/manifest.test.ts`
- Modify: `docs/superpowers/specs/2026-10-04-fx-converter-design.md` (placement)

**Interfaces:**
- Consumes: `useConvert` (Task 2), `resolvePair` (Task 1), `Converter` (Task 3),
  `refreshFxRatesAction(): Promise<void>` (`@features/settings/actions`), `PageContainer` (`@shared/ui/PageContainer`).

- [ ] **Step 1: Write the failing tests**

In `src/shared/ui/MoreSheet.test.tsx`, replace the expected list in
`'lists every destination once, in group order'` with:

```ts
    expect(hrefs()).toEqual([
      '/categories',
      '/accounts',
      '/currency',
      '/year',
      '/month',
      '/report',
      '/trips',
      '/budgets?cycle=2026-08',
      '/recurring',
      '/convert',
      '/settings',
      '/checkup',
      '/about',
    ]);
```

In `src/app/manifest.test.ts`, add inside `describe('manifest shortcuts', …)`:

```ts
  it('offers a Convert shortcut for the counter abroad', () => {
    const shortcut = manifest().shortcuts?.find((s) => s.url === '/convert');
    expect(shortcut?.short_name).toBe('Convert');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/shared/ui/MoreSheet.test.tsx src/app/manifest.test.ts`
Expected: FAIL. `/convert` is missing from the href list, and the shortcut is `undefined`.

- [ ] **Step 3: Implement the More tile, the shortcut and the route**

`src/shared/ui/MoreSheet.tsx`: add `ArrowLeftRight` to the `lucide-react` import, then make the
`plan` group:

```ts
  {
    id: 'plan',
    caption: 'Plan',
    links: [
      { href: '/budgets', label: 'Budgets', Icon: Target, cycle: true },
      { href: '/recurring', label: 'Recurring', Icon: Repeat, cycle: false },
      // Convert fills Plan's short row instead of orphaning a fourth tile under Lists: checking what
      // ¥1,200 costs before you pay is forward-looking, like the other two.
      { href: '/convert', label: 'Convert', Icon: ArrowLeftRight, cycle: false },
    ],
  },
```

Also update the header comment's layout sentence to: "Thirteen tiles across three columns: Lists,
Plan and App fill a row each, Review wraps to a row of three plus one." It currently reads "Twelve
tiles … Plan is a short row of two".

`src/app/manifest.ts` line 30:

```ts
    shortcuts: [
      { name: 'New entry', short_name: 'New', url: '/entries/new' },
      { name: 'Convert currency', short_name: 'Convert', url: '/convert' },
    ],
```

`src/app/convert/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { useConvert } from '@features/currencies/use-convert';
import { resolvePair } from '@features/currencies/convert';
import { Converter } from '@features/currencies/ui/Converter';
import { refreshFxRatesAction } from '@features/settings/actions';

// /convert — a read-only exchange-rate calculator over the cached ECB rates. State rides in the URL
// (?from=&to=&amt=) like every other page; the amount is mirrored into local state so typing never
// waits on a router round-trip, and router.replace keeps keystrokes out of the back stack.
export default function ConvertPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, data } = useConvert();
  const [amount, setAmount] = useState(params.get('amt') ?? '');

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  const pair = resolvePair(data.codes, params.get('from'), params.get('to'));

  const go = (from: string, to: string, amt: string) => {
    const next = new URLSearchParams({ from, to });
    if (amt !== '') next.set('amt', amt);
    router.replace(`/convert?${next.toString()}`);
  };

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Convert</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          ECB mid rate, plus what an exchange fee adds on top.
        </p>
      </header>
      {pair === null ? (
        <p className="panel p-5 text-sm" style={{ color: 'var(--color-muted)' }}>
          Add a foreign currency on the{' '}
          <Link href="/currency" className="underline">
            Currency
          </Link>{' '}
          page to convert it.
        </p>
      ) : (
        <Converter
          codes={data.codes}
          rates={data.rates}
          cardFeePct={data.cardFeePct}
          from={pair.from}
          to={pair.to}
          amount={amount}
          onAmount={(raw) => {
            setAmount(raw);
            go(pair.from, pair.to, raw);
          }}
          onPair={(from, to) => go(from, to, amount)}
          onRefresh={refreshFxRatesAction}
        />
      )}
    </PageContainer>
  );
}
```

`useSearchParams` needs no Suspense here: `AppShell` already wraps every page in one (see
`src/shared/ui/AppShell.tsx:52`).

- [ ] **Step 4: Run the tests and the build**

Run: `npm test -- src/shared/ui/MoreSheet.test.tsx src/app/manifest.test.ts`
Expected: PASS.

Run: `npm run build:web`
Expected: success, with `out/convert.html` (or `out/convert/index.html`) present.

- [ ] **Step 5: Update the spec's placement line**

In `docs/superpowers/specs/2026-10-04-fx-converter-design.md`, change the MoreSheet row of the
Modules table to:

```
| `src/shared/ui/MoreSheet.tsx` | Add `{ href: '/convert', label: 'Convert', Icon: ArrowLeftRight }` to the **Plan** group after Recurring — it fills Plan's short row; a fourth tile under Lists would orphan. |
```

Also update the "Entry" line in the testing section: "the More sheet entry (Plan group)".

- [ ] **Step 6: Verify in a real browser at 412px**

Start `npm run dev:web` (in the background), then with Playwright MCP on `http://127.0.0.1:4010`
(one tab only, because OPFS allows a single holder):

1. `browser_resize` to 412×900, then navigate to `/convert`. Expect JPY → THB (or the first foreign
   catalog code), four rows, and ★ on the row equal to the Settings card fee.
2. Type `1200`. The total column appears, totals rise with the fee, and the URL gains `amt=1200`.
3. Tap Swap. Now THB → JPY, and totals **fall** as the fee rises.
4. Pick USD → JPY. One row, plus the "Mid rate — card fees apply in baht" note.
5. Clear the amount. The total column disappears.
6. Tap Refresh. The date caption stays or updates, with no console errors
   (`browser_console_messages`).
7. Open More. The Convert tile sits in Plan, the row is full, and nothing is horizontally scrolled.
8. Screenshot steps 1 and 4 for the report.

- [ ] **Step 7: Gates and commit (two topics)**

```bash
npm run format:files src/app/convert/page.tsx src/shared/ui/MoreSheet.tsx src/shared/ui/MoreSheet.test.tsx src/app/manifest.ts src/app/manifest.test.ts docs/superpowers/specs/2026-10-04-fx-converter-design.md
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/convert/page.tsx src/shared/ui/MoreSheet.tsx src/shared/ui/MoreSheet.test.tsx src/app/manifest.ts src/app/manifest.test.ts
git commit -m "feat(app): add the /convert page" -m "Wires useConvert + Converter to URL state (?from=&to=&amt=), adds a Convert tile to the More sheet's Plan group and a launcher shortcut so the converter is one long-press away at a counter abroad."
git add docs/superpowers/specs/2026-10-04-fx-converter-design.md
git commit -m "docs(features): move the Convert tile to the Plan group in the spec" -m "Lists is exactly one row of three; Plan had a short row of two that the tile completes."
```
