# Keypad Currency Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the keypad enter a non-THB expense — pick a currency, key in the foreign amount, and store the THB value converted via the Visa card rate (with a configurable card FX fee %).

**Architecture:** No schema change — `entries.currency`/`originalAmount` and `parseEntryForm` already support this; only the keypad hardcodes THB. Add a `formatCurrency` display helper, a pure Visa-rate parser + fee/conversion helpers, an FX-rate cache + card-fee % in the existing `settings` KV table, a manual "Refresh FX rates" button, currency ordering (auto most-used-first, THB pinned), and the keypad currency picker. The card fee is applied server-side so the keypad receives fee-inclusive ("effective") rates and its conversion stays a pure `round(foreign × rate)`.

**Tech Stack:** TypeScript 5.9 (strict, ESM, extensionless relative imports), Next.js 16 App Router + React 19, better-sqlite3 + drizzle-orm, Vitest. Windows + Git Bash. Global TS bans apply: no `any`/`as`/`!`/ts-comments; `type` over `interface`; `for..of`; `Intl` for dates/numbers.

**Reference spec:** `docs/superpowers/specs/2026-07-13-keypad-currency-design.md`

**Quality gates (run before every commit, per CLAUDE.md):**
```bash
npm run format:files <changed files>
npm run typecheck
npm run lint
npm test
```

---

## File Structure

- `src/shared/money.ts` — MODIFY: add `formatCurrency`, `currencySymbol`.
- `src/features/entries/fx.ts` — CREATE: pure FX helpers (`parseVisaThbPerUnit`, `withFee`, `toThb`, `visaRatesUrl`). No network, no DB — safe to import from client + server.
- `src/features/entries/entry-form.ts` — MODIFY: export the existing `isCurrency` guard.
- `src/features/settings/queries.ts` — MODIFY: card-fee % getters/validator + FX-rate cache getters/guard.
- `src/features/settings/actions.ts` — MODIFY: `setCardFeePctAction`, `refreshFxRatesAction` (server-side Visa fetch lives here).
- `src/features/settings/ui/FxSettings.tsx` — CREATE: card-fee field + refresh button (client component).
- `src/app/settings/page.tsx` — MODIFY: render the FX settings section.
- `src/features/entries/queries.ts` — MODIFY: add `getCurrencyCounts`.
- `src/features/entries/keypad-lists.ts` — MODIFY: add `getKeypadCurrencies`.
- `src/features/entries/ui/Keypad.tsx` — MODIFY: `KeypadCurrency` type, currency picker view, foreign-amount display, rate line, hidden fields.
- `src/app/entries/new/page.tsx` — MODIFY: pass `currencies`/`rates`/`ratesAsOf`.
- `src/app/entries/[id]/edit/page.tsx` — MODIFY: relax the keypad-editable gate to any expense; pass the same props.

Test files are co-located `*.test.ts` next to each module.

---

## Task 1: Money display helpers (`formatCurrency`, `currencySymbol`)

**Files:**
- Modify: `src/shared/money.ts`
- Test: `src/shared/money.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/append `src/shared/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, currencySymbol } from './money';

describe('formatCurrency', () => {
  it('renders a 0-decimal currency (JPY) with its narrow symbol and no fraction', () => {
    expect(formatCurrency(3000, 'JPY')).toBe('¥3,000');
  });

  it('renders a 2-decimal currency (USD) with its narrow symbol', () => {
    expect(formatCurrency(20, 'USD')).toBe('$20.00');
  });
});

describe('currencySymbol', () => {
  it('returns the narrow symbol glyph for a code', () => {
    expect(currencySymbol('JPY')).toBe('¥');
    expect(currencySymbol('THB')).toBe('฿');
    expect(currencySymbol('KRW')).toBe('₩');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/shared/money.test.ts`
Expected: FAIL — `formatCurrency`/`currencySymbol` are not exported.

- [ ] **Step 3: Implement**

Append to `src/shared/money.ts`:

```ts
// Per-currency Intl formatter, memoized. narrowSymbol → ¥, ₩, $, €, HK$, £, S$, ฿; Intl picks the
// correct fraction digits per currency automatically (JPY/KRW → 0, most others → 2). Used for
// foreign-currency entry display on the keypad; THB rollups keep formatBaht above.
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  const existing = currencyFormatters.get(currency);
  if (existing !== undefined) return existing;
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  });
  currencyFormatters.set(currency, fmt);
  return fmt;
}

export function formatCurrency(amount: number, currency: string): string {
  return formatterFor(currency).format(amount);
}

// Just the symbol glyph (for picker chips), extracted from Intl parts — no hand-maintained table.
export function currencySymbol(currency: string): string {
  const part = formatterFor(currency)
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part === undefined ? currency : part.value;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/shared/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/shared/money.ts src/shared/money.test.ts
npm run typecheck && npm run lint
git add src/shared/money.ts src/shared/money.test.ts
git commit -m "feat(shared): add formatCurrency and currencySymbol helpers" -m "Memoized per-currency Intl narrowSymbol formatters for foreign-currency display on the keypad. formatBaht stays for THB rollups."
```

---

## Task 2: Pure FX helpers (`src/features/entries/fx.ts`)

**Files:**
- Create: `src/features/entries/fx.ts`
- Test: `src/features/entries/fx.test.ts`

Background: the Visa endpoint `https://usa.visa.com/cmsapi/fx/rates?...&fromCurr=<X>&toCurr=THB` returns JSON whose `reverseAmount` field is THB-per-1-unit-of-X (empirically: USD → `"33.210033"`, JPY → `"0.204306"`). We fetch with `fee=0` (pure Visa rate) and apply the card fee ourselves via `withFee`, because Visa's own `fee` param inflates the THB→foreign leg (wrong direction).

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/fx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseVisaThbPerUnit, withFee, toThb, visaRatesUrl } from './fx';

// Trimmed real responses captured from usa.visa.com (fromCurr=<X>&toCurr=THB, fee=0).
const VISA_JPY = { conversionFromCurrency: 'JPY', conversionToCurrency: 'THB', reverseAmount: '0.204306', status: 'success' };
const VISA_USD = { conversionFromCurrency: 'USD', conversionToCurrency: 'THB', reverseAmount: '33.210033', status: 'success' };

describe('parseVisaThbPerUnit', () => {
  it('extracts THB-per-unit from reverseAmount (JPY < 1, USD ~33) — a direction flip would break these bands', () => {
    const jpy = parseVisaThbPerUnit(VISA_JPY);
    const usd = parseVisaThbPerUnit(VISA_USD);
    expect(jpy).toBeCloseTo(0.204306, 6);
    expect(usd).toBeCloseTo(33.210033, 6);
    expect(jpy).toBeGreaterThan(0.05);
    expect(jpy).toBeLessThan(1);
    expect(usd).toBeGreaterThan(20);
    expect(usd).toBeLessThan(50);
  });

  it('throws on a missing or non-numeric reverseAmount', () => {
    expect(() => parseVisaThbPerUnit({})).toThrow();
    expect(() => parseVisaThbPerUnit({ reverseAmount: 'x' })).toThrow();
    expect(() => parseVisaThbPerUnit(null)).toThrow();
  });
});

describe('withFee', () => {
  it('layers a percentage markup on the base rate', () => {
    expect(withFee(33.21, 2)).toBeCloseTo(33.8742, 4);
    expect(withFee(0.2, 0)).toBe(0.2);
  });
});

describe('toThb', () => {
  it('converts a foreign amount at an effective rate, rounded to whole THB', () => {
    expect(toThb(3000, 0.208)).toBe(624);
    expect(toThb(20, 33.8742)).toBe(677);
  });
});

describe('visaRatesUrl', () => {
  it('builds the usa.visa.com URL with fee=0, THB target, and an MM/DD/YYYY date', () => {
    const url = visaRatesUrl('JPY', new Date('2026-07-13T00:00:00Z'));
    expect(url).toContain('https://usa.visa.com/cmsapi/fx/rates?');
    expect(url).toContain('fromCurr=JPY');
    expect(url).toContain('toCurr=THB');
    expect(url).toContain('fee=0');
    expect(url).toContain('exchangedate=07%2F13%2F2026');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/entries/fx.test.ts`
Expected: FAIL — module `./fx` does not exist.

- [ ] **Step 3: Implement**

Create `src/features/entries/fx.ts`:

```ts
import type { Currency } from './entry-form';

// Pure FX helpers for the keypad currency feature. No network and no DB here — the actual Visa
// fetch lives in settings/actions.ts (server) and imports visaRatesUrl + parseVisaThbPerUnit from
// this module. Kept pure so it is safe to import from the client Keypad (for toThb) too.

// Visa's consumer FX endpoint reports `reverseAmount` = THB per 1 unit of the queried currency when
// called as fromCurr=<X>&toCurr=THB (verified: USD → 33.21, JPY → 0.2043). The field directions in
// the rest of the payload are quirky (from/to appear swapped), so we read this one field and assert
// it is a positive finite number — a response-shape change then throws instead of caching garbage.
export function parseVisaThbPerUnit(json: unknown): number {
  if (typeof json !== 'object' || json === null || !('reverseAmount' in json)) {
    throw new Error('Visa FX response missing reverseAmount');
  }
  const rate = Number(json.reverseAmount);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Visa FX rate is not a positive number: ${String(json.reverseAmount)}`);
  }
  return rate;
}

// Layer the card's FX markup onto the pure Visa rate. Applied here (not via Visa's `fee` param)
// because Visa applies its fee to the THB→foreign leg, which would make a foreign purchase cost
// FEWER THB — the wrong direction.
export function withFee(baseRate: number, feePct: number): number {
  return baseRate * (1 + feePct / 100);
}

// Foreign amount → whole THB at an already-fee-inclusive (effective) rate. The ledger shows THB with
// no fraction digits, so rounding to whole baht here matches display and keeps sums clean.
export function toThb(foreign: number, effectiveRate: number): number {
  return Math.round(foreign * effectiveRate);
}

// The usa.visa.com query URL for one currency → THB, fee=0 (pure rate). Date must be MM/DD/YYYY;
// URLSearchParams encodes the slashes to %2F. The .com.sg host is Cloudflare-bot-walled — use
// usa.visa.com, which answers a plain fetch.
export function visaRatesUrl(from: Currency, date: Date): string {
  const mmddyyyy = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
  const params = new URLSearchParams({
    amount: '1',
    fee: '0',
    utcConvertedDate: mmddyyyy,
    exchangedate: mmddyyyy,
    fromCurr: from,
    toCurr: 'THB',
  });
  return `https://usa.visa.com/cmsapi/fx/rates?${params.toString()}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/entries/fx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/fx.ts src/features/entries/fx.test.ts
npm run typecheck && npm run lint
git add src/features/entries/fx.ts src/features/entries/fx.test.ts
git commit -m "feat(entries): add pure Visa FX helpers" -m "parseVisaThbPerUnit (reads reverseAmount, self-checked band), withFee (card markup, applied in-code because Visa's fee param is direction-wrong), toThb (round to whole THB), visaRatesUrl."
```

---

## Task 3: Export the `isCurrency` guard

**Files:**
- Modify: `src/features/entries/entry-form.ts:10`

- [ ] **Step 1: Make the guard public**

In `src/features/entries/entry-form.ts`, change:

```ts
function isCurrency(value: string): value is Currency {
```

to:

```ts
export function isCurrency(value: string): value is Currency {
```

(The keypad uses it to validate an edited row's stored currency without `as`.)

- [ ] **Step 2: Verify nothing broke**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/entries/entry-form.ts
git commit -m "refactor(entries): export isCurrency guard for keypad reuse"
```

---

## Task 4: Card FX fee % setting

**Files:**
- Modify: `src/features/settings/queries.ts`
- Test: `src/features/settings/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/settings/queries.test.ts` (and add `getCardFeePct, setCardFeePct, isValidCardFeePct` to the existing import from `./queries`):

```ts
describe('getCardFeePct / setCardFeePct', () => {
  it('defaults to 2 when nothing is stored', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    expect(getCardFeePct(db)).toBe(2);
  });

  it('round-trips a stored fee and overwrites on re-write', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    setCardFeePct(db, 1.5);
    expect(getCardFeePct(db)).toBe(1.5);
    setCardFeePct(db, 0);
    expect(getCardFeePct(db)).toBe(0);
  });

  it('falls back to 2 if the stored value is out of range', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    db.run(sql`INSERT INTO settings (key, value) VALUES ('card_fx_fee_pct', '999')`);
    expect(getCardFeePct(db)).toBe(2);
  });
});

describe('isValidCardFeePct', () => {
  it('accepts 0..10 and rejects negatives, >10, and NaN', () => {
    expect(isValidCardFeePct(0)).toBe(true);
    expect(isValidCardFeePct(2)).toBe(true);
    expect(isValidCardFeePct(10)).toBe(true);
    expect(isValidCardFeePct(-1)).toBe(false);
    expect(isValidCardFeePct(10.5)).toBe(false);
    expect(isValidCardFeePct(Number.NaN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Implement**

Append to `src/features/settings/queries.ts`:

```ts
// Card FX fee % — the user's card foreign-transaction markup, layered onto the pure Visa rate when
// converting a foreign entry to THB. Reuses the KV table like cutoff/icon-set. Default 2%.
const CARD_FEE_KEY = 'card_fx_fee_pct';
const DEFAULT_CARD_FEE = 2;

export function isValidCardFeePct(pct: number): boolean {
  return Number.isFinite(pct) && pct >= 0 && pct <= 10;
}

export function getCardFeePct(db: Db): number {
  const [row] = db.select().from(settings).where(eq(settings.key, CARD_FEE_KEY)).all();
  if (row === undefined) return DEFAULT_CARD_FEE;
  const pct = Number(row.value);
  return isValidCardFeePct(pct) ? pct : DEFAULT_CARD_FEE;
}

export function setCardFeePct(db: Db, pct: number): void {
  db.transaction((tx) => {
    tx.delete(settings).where(eq(settings.key, CARD_FEE_KEY)).run();
    tx.insert(settings)
      .values({ key: CARD_FEE_KEY, value: String(pct) })
      .run();
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/queries.ts src/features/settings/queries.test.ts
npm run typecheck && npm run lint
git add src/features/settings/queries.ts src/features/settings/queries.test.ts
git commit -m "feat(settings): add card FX fee % setting (default 2)"
```

---

## Task 5: FX-rate cache in settings

**Files:**
- Modify: `src/features/settings/queries.ts`
- Test: `src/features/settings/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/settings/queries.test.ts` (add `getFxRates, setFxRates` to the `./queries` import):

```ts
describe('getFxRates / setFxRates', () => {
  it('defaults to an empty map', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    expect(getFxRates(db)).toEqual({});
  });

  it('round-trips a rate map', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    const rates = { JPY: { thbPerUnit: 0.2043, asOf: '2026-07-13' } };
    setFxRates(db, rates);
    expect(getFxRates(db)).toEqual(rates);
  });

  it('returns {} when the stored blob is malformed', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    db.run(sql`INSERT INTO settings (key, value) VALUES ('fx_rates', 'not json')`);
    expect(getFxRates(db)).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: FAIL — `getFxRates`/`setFxRates` not exported.

- [ ] **Step 3: Implement**

Append to `src/features/settings/queries.ts`:

```ts
// Cached Visa FX rates, one JSON blob under a single KV key. thbPerUnit is the PURE Visa rate
// (fee applied later at conversion time); asOf is the en-CA date it was fetched. Offline-tolerant:
// callers keep the last blob when a refresh fails.
const FX_RATES_KEY = 'fx_rates';
export type FxRateEntry = { thbPerUnit: number; asOf: string };
export type FxRates = Record<string, FxRateEntry>;

function isFxRates(value: unknown): value is FxRates {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).every(
    (v) =>
      typeof v === 'object' &&
      v !== null &&
      'thbPerUnit' in v &&
      'asOf' in v &&
      typeof v.thbPerUnit === 'number' &&
      typeof v.asOf === 'string',
  );
}

export function getFxRates(db: Db): FxRates {
  const [row] = db.select().from(settings).where(eq(settings.key, FX_RATES_KEY)).all();
  if (row === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    return isFxRates(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function setFxRates(db: Db, rates: FxRates): void {
  db.transaction((tx) => {
    tx.delete(settings).where(eq(settings.key, FX_RATES_KEY)).run();
    tx.insert(settings)
      .values({ key: FX_RATES_KEY, value: JSON.stringify(rates) })
      .run();
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/queries.ts src/features/settings/queries.test.ts
npm run typecheck && npm run lint
git add src/features/settings/queries.ts src/features/settings/queries.test.ts
git commit -m "feat(settings): add FX-rate cache (getFxRates/setFxRates)"
```

---

## Task 6: Settings actions — set card fee + refresh FX rates

**Files:**
- Modify: `src/features/settings/actions.ts`

No unit test (thin server action doing network I/O + revalidate — verified manually in Task 11). The parse/convert logic it depends on is already tested in Tasks 2, 4, 5.

- [ ] **Step 1: Implement**

In `src/features/settings/actions.ts`, add imports at the top (alongside the existing ones):

```ts
import { setCardFeePct, isValidCardFeePct, getFxRates, setFxRates } from './queries';
import type { FxRates } from './queries';
import { CURRENCIES } from '@features/entries/entry-form';
import { visaRatesUrl, parseVisaThbPerUnit } from '@features/entries/fx';
```

Append these two actions:

```ts
// Save the card FX fee %. Validated (0..10) before writing; the <input> min/max is only a hint.
export async function setCardFeePctAction(formData: FormData): Promise<void> {
  const raw = formData.get('pct');
  const pct = Number(raw);
  if (!isValidCardFeePct(pct)) {
    throw new Error(`Card FX fee must be between 0 and 10, got: ${typeof raw === 'string' ? raw : 'a file'}`);
  }
  const db = initDb();
  ensureSettingsTable(db);
  setCardFeePct(db, pct);
  revalidatePath('/', 'layout');
}

// Manually refresh cached Visa rates for every non-THB currency. One HTTP call per currency; a
// failed pair keeps its last cached value rather than aborting. Rates cached fee-free (pure Visa).
export async function refreshFxRatesAction(): Promise<void> {
  const db = initDb();
  ensureSettingsTable(db);
  const next: FxRates = { ...getFxRates(db) };
  const now = new Date();
  const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
  for (const code of CURRENCIES) {
    if (code === 'THB') continue;
    try {
      const res = await fetch(visaRatesUrl(code, now), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (!res.ok) continue;
      const json: unknown = await res.json();
      next[code] = { thbPerUnit: parseVisaThbPerUnit(json), asOf };
    } catch {
      // Keep the last cached value for this currency — offline-tolerant.
    }
  }
  setFxRates(db, next);
  revalidatePath('/', 'layout');
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm run format:files src/features/settings/actions.ts
git add src/features/settings/actions.ts
git commit -m "feat(settings): add setCardFeePct + refreshFxRates server actions" -m "refreshFxRates fetches usa.visa.com per non-THB currency (fee=0), caches the pure rate, and keeps last-known values on per-currency failure."
```

---

## Task 7: Settings UI — FX section

**Files:**
- Create: `src/features/settings/ui/FxSettings.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Create the client component**

Create `src/features/settings/ui/FxSettings.tsx`:

```tsx
'use client';

import { setCardFeePctAction, refreshFxRatesAction } from '../actions';

// Card FX fee % + a manual "Refresh FX rates" button. Two independent forms so each posts on its own.
// `rates` is the code→asOf-date map for the "as of" line; empty means never fetched.
export function FxSettings({ cardFeePct, ratesAsOf }: { cardFeePct: number; ratesAsOf: Record<string, string> }) {
  const dates = Object.values(ratesAsOf).sort();
  const asOf = dates.length > 0 ? dates[dates.length - 1] : null;
  const count = Object.keys(ratesAsOf).length;

  return (
    <div className="flex flex-col gap-4">
      <form action={setCardFeePctAction} className="flex flex-col gap-3">
        <label htmlFor="pct" className="text-sm font-medium">
          Card FX fee %
        </label>
        <input
          id="pct"
          name="pct"
          type="number"
          min={0}
          max={10}
          step={0.1}
          inputMode="decimal"
          defaultValue={cardFeePct}
          required
          className="min-h-11 w-24 rounded-[var(--radius-sm)] border px-3 py-2 text-base"
          style={{ borderColor: 'var(--color-border)' }}
        />
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Your card&apos;s foreign-transaction markup, added on top of the Visa rate so a non-THB
          entry&apos;s stored baht matches your statement.
        </p>
        <button type="submit" className="btn btn-primary w-fit">
          Save
        </button>
      </form>

      <form action={refreshFxRatesAction} className="flex flex-col gap-2">
        <button type="submit" className="btn btn-primary w-fit">
          Refresh FX rates
        </button>
        <p className="tnum text-xs" style={{ color: 'var(--color-faint)' }}>
          {asOf === null
            ? 'No rates cached yet — tap to fetch the latest Visa rates.'
            : `Visa rates for ${count} ${count === 1 ? 'currency' : 'currencies'}, as of ${asOf}.`}
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the settings page**

In `src/app/settings/page.tsx`:

Add to the queries import (line 6):

```ts
import { getCutoff, getIconSet, ICON_SETS, getCardFeePct, getFxRates } from '@features/settings/queries';
```

Add a component import:

```ts
import { FxSettings } from '@features/settings/ui/FxSettings';
```

After `const iconSet = getIconSet(db);` (line 21), add:

```ts
  const cardFeePct = getCardFeePct(db);
  const fxRates = getFxRates(db);
  const ratesAsOf: Record<string, string> = {};
  for (const [code, entry] of Object.entries(fxRates)) {
    ratesAsOf[code] = entry.asOf;
  }
```

Add a new `<section>` before the Danger zone section (before line 89's `<section ...loss>`):

```tsx
      <section className="panel flex flex-col gap-4 p-5">
        <h2 className="text-sm font-semibold">Foreign currency</h2>
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          The keypad can enter a non-THB expense using the Visa card rate. Set your card fee and
          refresh the rates before a trip.
        </p>
        <FxSettings cardFeePct={cardFeePct} ratesAsOf={ratesAsOf} />
      </section>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/features/settings/ui/FxSettings.tsx src/app/settings/page.tsx
git add src/features/settings/ui/FxSettings.tsx src/app/settings/page.tsx
git commit -m "feat(settings): add foreign-currency section (card fee + refresh rates)"
```

---

## Task 8: Currency usage ordering

**Files:**
- Modify: `src/features/entries/queries.ts`
- Modify: `src/features/entries/keypad-lists.ts`
- Modify: `src/features/entries/ui/Keypad.tsx` (add the `KeypadCurrency` type export only — full UI is Task 9)
- Test: `src/features/entries/keypad-lists.test.ts`

- [ ] **Step 1: Add the `KeypadCurrency` type to Keypad.tsx**

In `src/features/entries/ui/Keypad.tsx`, near the existing `KeypadCategory`/`KeypadAccount` type exports (line 13-14), add an import and the type:

```ts
import type { Currency } from '../entry-form';
```

```ts
export type KeypadCurrency = { code: Currency; symbol: string };
```

- [ ] **Step 2: Write the failing test**

Append to `src/features/entries/keypad-lists.test.ts` (add `getKeypadCurrencies` to the imports from `./keypad-lists`, and import `ensureEntriesTable`, `initDb`, `sql` as needed — match the file's existing test setup style):

```ts
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { getKeypadCurrencies } from './keypad-lists';

describe('getKeypadCurrencies', () => {
  it('pins THB first, orders the rest by usage, and appends unused currencies', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    // 3 JPY rows, 1 USD row, no others.
    db.run(sql`INSERT INTO entries (date, amount, currency, source) VALUES
      ('2026-07-01', -100, 'JPY', 'manual'),
      ('2026-07-02', -100, 'JPY', 'manual'),
      ('2026-07-03', -100, 'JPY', 'manual'),
      ('2026-07-04', -100, 'USD', 'manual')`);

    const codes = getKeypadCurrencies(db).map((c) => c.code);
    expect(codes[0]).toBe('THB'); // always first
    expect(codes.indexOf('JPY')).toBeLessThan(codes.indexOf('USD')); // more-used first
    // every known currency appears exactly once
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('KRW'); // unused, still present
  });

  it('carries a symbol for each currency', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    const thb = getKeypadCurrencies(db).find((c) => c.code === 'THB');
    expect(thb?.symbol).toBe('฿');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/features/entries/keypad-lists.test.ts`
Expected: FAIL — `getKeypadCurrencies` and `getCurrencyCounts` not defined.

- [ ] **Step 4: Implement `getCurrencyCounts` in queries.ts**

In `src/features/entries/queries.ts`, add (near `getAccountsByUsage`):

```ts
// Non-null currency codes seen in the ledger, most-used first. Drives the keypad currency picker's
// auto-ordering (THB pinned separately in keypad-lists). Nulls (legacy THB rows) are excluded.
export function getCurrencyCounts(db: Db): { currency: string; count: number }[] {
  return db
    .select({ currency: entries.currency, count: sql<number>`count(${entries.id})` })
    .from(entries)
    .where(sql`${entries.currency} is not null`)
    .groupBy(entries.currency)
    .all()
    .filter((r): r is { currency: string; count: number } => r.currency !== null)
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 5: Implement `getKeypadCurrencies` in keypad-lists.ts**

In `src/features/entries/keypad-lists.ts`, add imports:

```ts
import { getCurrencyCounts } from './queries';
import { CURRENCIES } from './entry-form';
import { currencySymbol } from '@shared/money';
import type { KeypadCategory, KeypadAccount, KeypadCurrency } from './ui/Keypad';
```

(Extend the existing `import type { KeypadCategory, KeypadAccount }` line to include `KeypadCurrency`.)

Append:

```ts
// The keypad's currency picker: THB pinned first, then the remaining currencies by ledger usage,
// with never-used ones (rank MAX) trailing in their declared order. Auto-tunes per trip — no manual
// reorder. Each entry carries its narrowSymbol glyph for the picker chips.
export function getKeypadCurrencies(db: Db): KeypadCurrency[] {
  const rank = new Map(getCurrencyCounts(db).map((c, i) => [c.currency, i]));
  const MAX = Number.MAX_SAFE_INTEGER;
  const ordered = [...CURRENCIES].sort((a, b) => {
    if (a === b) return 0;
    if (a === 'THB') return -1;
    if (b === 'THB') return 1;
    return (rank.get(a) ?? MAX) - (rank.get(b) ?? MAX);
  });
  return ordered.map((code) => ({ code, symbol: currencySymbol(code) }));
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/features/entries/keypad-lists.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/keypad-lists.ts src/features/entries/ui/Keypad.tsx src/features/entries/keypad-lists.test.ts
npm run typecheck && npm run lint
git add src/features/entries/queries.ts src/features/entries/keypad-lists.ts src/features/entries/ui/Keypad.tsx src/features/entries/keypad-lists.test.ts
git commit -m "feat(entries): auto-order keypad currencies most-used-first (THB pinned)"
```

---

## Task 9: Keypad currency picker UI

**Files:**
- Modify: `src/features/entries/ui/Keypad.tsx`

This replaces the whole component to add the currency chip, a 4th "currency" view, foreign-amount display, the editable rate line, and the `thb` hidden field. `KeypadCurrency` and the `Currency` import were added in Task 8 — keep them.

- [ ] **Step 1: Replace `Keypad.tsx` with the currency-aware version**

Replace the entire contents of `src/features/entries/ui/Keypad.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { formatBaht, formatCurrency } from '@shared/money';
import { formatDayHeading } from '@shared/date';
import { addEntryAction } from '../actions';
import { evaluate } from '../calc';
import { toThb } from '../fx';
import { isCurrency } from '../entry-form';
import type { Currency } from '../entry-form';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { AccountIcon } from '@features/accounts/ui/AccountIcon';
import type { IconSet } from '@features/settings/queries';
import type { EntryRow } from '../schema';

export type KeypadCategory = { name: string; emoji: string; hue?: number };
export type KeypadAccount = { name: string; icon: string; hue?: number };
export type KeypadCurrency = { code: Currency; symbol: string };

const OPS = '+−×÷';
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+'];

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
// Four views (keypad / account / currency / category) toggle via `hidden` inside one always-mounted
// <form>. The amount you key in is in the selected `currency`; for a non-THB currency the THB value
// posted (hidden `thb`) is the foreign amount × the effective (fee-inclusive) rate. Reused for the
// new-entry route and for editing an expense (THB or foreign) — pass `entry` + editEntryAction.
export function Keypad({
  categories,
  accounts,
  currencies,
  rates,
  ratesAsOf,
  defaultAccount,
  today,
  iconSet,
  action = addEntryAction,
  entry,
}: {
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  currencies: KeypadCurrency[];
  rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
  ratesAsOf: Record<string, string>;
  defaultAccount: string;
  today: string;
  iconSet: IconSet;
  action?: (formData: FormData) => Promise<void>;
  entry?: EntryRow;
}) {
  const initialCurrency: Currency =
    entry && entry.currency !== null && isCurrency(entry.currency) ? entry.currency : 'THB';
  const initialForeign = entry
    ? String(
        Math.abs(
          initialCurrency !== 'THB' && entry.originalAmount !== null
            ? entry.originalAmount
            : entry.amount,
        ),
      )
    : '';
  // Preserve an edited foreign row's own rate: its stored effective rate = |THB| / |foreign|.
  const initialOverride =
    entry && initialCurrency !== 'THB' && entry.originalAmount
      ? String(Math.abs(entry.amount) / Math.abs(entry.originalAmount))
      : '';

  const [expr, setExpr] = useState(initialForeign);
  const [view, setView] = useState<'keypad' | 'account' | 'currency' | 'category'>('keypad');
  const [date, setDate] = useState(entry?.date ?? today);
  const [account, setAccount] = useState(entry?.account ?? defaultAccount);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [rateOverride, setRateOverride] = useState(initialOverride);

  const isCustomDate = date !== today;
  const amount = evaluate(expr); // the FOREIGN figure keyed in
  const validAmount = amount !== null && amount > 0;
  const isThb = currency === 'THB';
  const symbol = currencies.find((c) => c.code === currency)?.symbol ?? currency;

  const overrideNum = rateOverride.trim() === '' ? null : Number(rateOverride);
  const effectiveRate =
    overrideNum !== null && Number.isFinite(overrideNum) && overrideNum > 0
      ? overrideNum
      : (rates[currency] ?? null);
  const hasRate = isThb || (effectiveRate !== null && effectiveRate > 0);
  const thbValue = amount === null ? 0 : isThb ? amount : toThb(amount, effectiveRate ?? 0);
  const canSubmit = validAmount && hasRate && (isThb || thbValue > 0);
  const spaced = expr.replace(/([+−×÷])/g, ' $1 ').trim();

  return (
    <form action={action} className="flex flex-col gap-4">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      {entry ? <input type="hidden" name="time" value={entry.time ?? ''} /> : null}
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="direction" value="expense" />
      <input type="hidden" name="amount" value={validAmount ? String(amount) : ''} />
      <input type="hidden" name="thb" value={canSubmit ? String(thbValue) : ''} />
      <input type="hidden" name="account" value={account} />

      {/* Amount + inputs + keypad */}
      <div className={view === 'keypad' ? 'flex flex-col gap-4' : 'hidden'}>
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
              onChange={(e) => {
                const v = e.target.value;
                if (v && v <= today) setDate(v);
              }}
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

          {/* Currency chip → opens the currency grid. */}
          <button
            type="button"
            onClick={() => setView('currency')}
            aria-haspopup="true"
            aria-label={`Currency: ${currency}`}
            className="tap ml-auto shrink-0 justify-center gap-1.5 rounded-full px-4 text-sm font-medium active:opacity-70"
            style={chipStyle(!isThb)}
          >
            <span className="tnum">
              {symbol} {currency}
            </span>
            <span aria-hidden>▾</span>
          </button>

          {/* Account chip → opens the account grid. */}
          <button
            type="button"
            onClick={() => setView('account')}
            aria-haspopup="true"
            aria-label={`Account: ${account}`}
            className="tap max-w-full shrink-0 justify-center gap-1.5 rounded-full px-4 text-sm font-medium active:opacity-70"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          >
            <span className="truncate">{account}</span>
            <span aria-hidden>▾</span>
          </button>
        </div>

        <div className="panel flex flex-col items-end gap-1 px-5 py-4">
          <span className="tnum text-sm" style={{ color: 'var(--color-faint)' }}>
            {spaced || ' '}
          </span>
          <span
            className="tnum text-4xl font-semibold"
            style={{ color: validAmount ? 'var(--color-text)' : 'var(--color-faint)' }}
          >
            {isThb ? formatBaht(amount ?? 0) : formatCurrency(amount ?? 0, currency)}
          </span>

          {/* Rate line — only for a non-THB currency. Rate is editable (per-entry override); blank
              falls back to the cached effective rate. Shows the ≈THB result, or a prompt if there's
              no rate to convert with. */}
          {!isThb ? (
            <div className="mt-1 flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm">
              <span style={{ color: 'var(--color-muted)' }} className="tnum">
                1 {currency} =
              </span>
              <input
                name="rate-display"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={rateOverride}
                onChange={(e) => setRateOverride(e.target.value)}
                placeholder={rates[currency] !== undefined ? String(rates[currency]) : 'rate'}
                aria-label={`THB per 1 ${currency}`}
                className="tnum h-9 w-24 rounded-[var(--radius-sm)] border px-2 text-right text-sm"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              />
              <span style={{ color: 'var(--color-muted)' }} className="tnum">
                THB
              </span>
              <span
                className="tnum font-semibold"
                style={{ color: hasRate ? 'var(--color-text)' : 'var(--color-faint)' }}
              >
                {hasRate ? `≈ ${formatBaht(thbValue)}` : 'no rate'}
              </span>
            </div>
          ) : null}
        </div>

        {!isThb && !hasRate ? (
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            No {currency} rate cached. Refresh FX rates in Settings, or type a rate above.
          </p>
        ) : null}

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
          disabled={!canSubmit}
          className="btn btn-primary w-full disabled:opacity-40"
        >
          Choose category
        </button>
      </div>

      {/* Currency picker — a grid of every currency (most-used first, THB pinned). Sets state and
          returns; does not submit. */}
      <div className={view === 'currency' ? 'flex flex-col gap-3' : 'hidden'}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView('keypad')}
            className="tap text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            ‹ Back
          </button>
          <span className="text-sm font-semibold">Currency</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {currencies.map((c) => {
            const on = currency === c.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  setCurrency(c.code);
                  setRateOverride(''); // drop any prior override; fall back to the cached rate
                  setView('keypad');
                }}
                aria-pressed={on}
                className="tnum flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border px-2 text-center text-sm font-medium transition-colors active:opacity-70"
                style={
                  on
                    ? {
                        background: 'var(--color-accent)',
                        color: 'var(--color-on-accent)',
                        borderColor: 'var(--color-accent)',
                      }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-text)' }
                }
              >
                <span className="text-2xl">{c.symbol}</span>
                <span>{c.code}</span>
                {ratesAsOf[c.code] !== undefined ? (
                  <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
                    {ratesAsOf[c.code]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Account picker */}
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
        <div className="grid grid-cols-3 gap-2">
          {accounts.map((a) => {
            const on = account === a.name;
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => {
                  setAccount(a.name);
                  setView('keypad');
                }}
                aria-pressed={on}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border px-2 text-center text-xs font-medium transition-colors active:opacity-70"
                style={
                  on
                    ? {
                        background: 'var(--color-accent)',
                        color: 'var(--color-on-accent)',
                        borderColor: 'var(--color-accent)',
                      }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-text)' }
                }
              >
                <AccountIcon icon={a.icon} name={a.name} size="lg" hue={a.hue} />
                <span className="line-clamp-3 w-full">{a.name}</span>
              </button>
            );
          })}
        </div>
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
          <span className="tnum text-sm font-semibold">{formatBaht(thbValue)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((c) => (
            <button
              key={c.name}
              type="submit"
              name="category"
              value={c.name}
              className="panel flex flex-col items-center gap-1 px-2 py-3 text-center transition-shadow active:opacity-70"
              style={
                entry?.category === c.name
                  ? {
                      borderColor: 'var(--color-accent)',
                      boxShadow: 'inset 0 0 0 1px var(--color-accent)',
                    }
                  : undefined
              }
            >
              <CategoryIcon emoji={c.emoji} name={c.name} size="lg" iconSet={iconSet} hue={c.hue} />
              <span className="w-full truncate text-xs" style={{ color: 'var(--color-muted)' }}>
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify (this will fail typecheck until Task 10 passes the new props)**

Run: `npm run typecheck`
Expected: errors in `new/page.tsx` and `[id]/edit/page.tsx` — they don't yet pass `currencies`/`rates`/`ratesAsOf`. That is fixed in Task 10; do NOT commit yet. If there are errors *inside* `Keypad.tsx` itself, fix them now.

- [ ] **Step 3: Proceed to Task 10 before committing** (the two tasks land together).

---

## Task 10: Wire the pages + relax the edit gate

**Files:**
- Modify: `src/app/entries/new/page.tsx`
- Modify: `src/app/entries/[id]/edit/page.tsx`

- [ ] **Step 1: New-entry page — load and pass the currency props**

In `src/app/entries/new/page.tsx`:

Add imports:

```ts
import { getKeypadCategories, getKeypadAccounts, getKeypadCurrencies } from '@features/entries/keypad-lists';
import { getIconSet, getCardFeePct, getFxRates } from '@features/settings/queries';
import { withFee } from '@features/entries/fx';
```

After `const accounts = getKeypadAccounts(db);`, add:

```ts
  const currencies = getKeypadCurrencies(db);
  const cardFeePct = getCardFeePct(db);
  const fxRates = getFxRates(db);
  const rates: Record<string, number> = {};
  const ratesAsOf: Record<string, string> = {};
  for (const [code, e] of Object.entries(fxRates)) {
    rates[code] = withFee(e.thbPerUnit, cardFeePct); // effective, fee-inclusive
    ratesAsOf[code] = e.asOf;
  }
```

Pass the new props on the `<Keypad ... />`:

```tsx
      <Keypad
        categories={categories}
        accounts={accounts}
        currencies={currencies}
        rates={rates}
        ratesAsOf={ratesAsOf}
        defaultAccount={latestAccount}
        today={todayIso()}
        iconSet={iconSet}
      />
```

- [ ] **Step 2: Edit page — relax the gate and pass the props**

In `src/app/entries/[id]/edit/page.tsx`:

Add imports:

```ts
import { getKeypadCategories, getKeypadAccounts, getKeypadCurrencies } from '@features/entries/keypad-lists';
import { getIconSet, getCardFeePct, getFxRates } from '@features/settings/queries';
import { withFee } from '@features/entries/fx';
```

Change the gate (line 34) from:

```ts
  const keypadEditable = entry.amount < 0 && (entry.currency === null || entry.currency === 'THB');
```

to:

```ts
  // The keypad now handles foreign-currency expenses too; only income stays on the full form.
  const keypadEditable = entry.amount < 0;
```

Inside the `if (keypadEditable)` block, after `const accounts = getKeypadAccounts(db);`, add:

```ts
    const currencies = getKeypadCurrencies(db);
    const cardFeePct = getCardFeePct(db);
    const fxRates = getFxRates(db);
    const rates: Record<string, number> = {};
    const ratesAsOf: Record<string, string> = {};
    for (const [code, e] of Object.entries(fxRates)) {
      rates[code] = withFee(e.thbPerUnit, cardFeePct);
      ratesAsOf[code] = e.asOf;
    }
```

Update the `<Keypad ... />` in that block to pass `currencies={currencies} rates={rates} ratesAsOf={ratesAsOf}` (keep the existing `action={editEntryAction}` and `entry={entry}`).

- [ ] **Step 3: Verify the whole app typechecks, lints, and tests**

Run:
```bash
npm run typecheck
npm run lint
npm test
```
Expected: all PASS.

- [ ] **Step 4: Commit Tasks 9 + 10 together**

```bash
npm run format:files src/features/entries/ui/Keypad.tsx src/app/entries/new/page.tsx "src/app/entries/[id]/edit/page.tsx"
git add src/features/entries/ui/Keypad.tsx src/app/entries/new/page.tsx "src/app/entries/[id]/edit/page.tsx"
git commit -m "feat(entries): add currency picker to the keypad" -m "Pick a currency, key in the foreign amount, store THB via the fee-inclusive Visa rate (editable per entry). Edit now handles foreign expenses too; income stays on the full form."
```

---

## Task 11: End-to-end verification

**Files:** none (manual verification against the running app).

- [ ] **Step 1: Full gate sweep**

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```
Expected: all PASS.

- [ ] **Step 2: Drive the app** (per the `verify`/`run` skills)

```bash
npm run dev:web   # 127.0.0.1:4010
```

Check:
1. **Settings → Foreign currency:** set Card FX fee % (e.g. 2), tap **Refresh FX rates** → "as of <today>" appears with a currency count. (Requires network; if offline, the count stays whatever was cached.)
2. **Add expense (THB):** unchanged — big number in ฿, no rate line, saves as before.
3. **Add expense (JPY):** tap the currency chip → pick JPY. Key in `3000` → big number shows `¥3,000`, rate line shows `1 JPY = <rate> THB · ≈ ฿<value>`. Edit the rate inline → the ≈฿ updates. Choose a category → saves.
4. **Records:** the JPY row shows its THB amount in the ledger (rollups unaffected).
5. **Edit that JPY row:** opens in the keypad with JPY selected, `¥3000` seeded, its stored rate seeded in the rate box; saving preserves the THB value.
6. **No-rate path:** pick a currency with no cached rate and blank the rate box → "Choose category" is disabled and the "No <cur> rate cached" hint shows; typing a rate re-enables it.

- [ ] **Step 3: Stop the dev server.** No commit (verification only). If issues surfaced, fix in the relevant task's file and re-run the gates before finishing.

---

## Self-Review notes (addressed)

- **Spec coverage:** currencies list (Task 8, reuses `CURRENCIES`), auto-ordering THB-first (Task 8), Visa fetch/cache/manual-refresh/offline-tolerance (Tasks 2, 5, 6, 7), card fee applied server-side (Tasks 4, 10, `withFee`), `formatCurrency`/`currencySymbol` (Task 1), keypad picker + editable rate + hidden `thb` (Task 9), server-component wiring + edit-gate relax (Task 10), tests (Tasks 1,2,4,5,8), out-of-scope items untouched.
- **Parser untouched:** `parseEntryForm` already reads `currency`/`amount`/`thb`; the keypad now posts all three. No change to `entry-form.ts` except exporting `isCurrency` (Task 3).
- **Type consistency:** `KeypadCurrency = { code: Currency; symbol: string }` (Tasks 8/9); `rates: Record<string, number>` is the effective fee-inclusive map everywhere; `FxRates`/`FxRateEntry` (Task 5) used by Tasks 6, 10; `toThb(foreign, effectiveRate)` two-arg signature consistent across Task 2 test, Task 9 usage.
- **No placeholders:** every step has concrete code/commands.
