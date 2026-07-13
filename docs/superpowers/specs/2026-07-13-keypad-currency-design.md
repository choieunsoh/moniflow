# Keypad currency entry — design

**Date:** 2026-07-13
**Branch context:** builds on `feat/keypad-reorder`
**Status:** approved for planning

## Goal

Let the keypad enter a non-THB expense: pick a currency, key in the **foreign** amount, and
store the THB-converted value using the **Visa** card exchange rate (with the user's card FX fee
baked in). Every rollup keeps working because storage stays THB.

## Why this is small

The data layer is already multi-currency. `entries.currency` and `entries.originalAmount` exist
(`src/features/entries/schema.ts`), and `parseEntryForm` (`src/features/entries/entry-form.ts`)
already reads `currency`, the foreign `amount`, and a separate `thb` field, storing:

- `amount = sign * thb` — signed THB, the basis for every rollup (unchanged contract)
- `originalAmount = sign * amount` — the foreign figure
- `currency` — the ISO code

Today the `Keypad` hardcodes `<input name="currency" value="THB">` and never renders the `thb`
field, so this branch never runs. This feature is **keypad UI + a rate cache + one settings knob**.

**No schema change. No query-layer read changes. `parseEntryForm` is untouched.**

## Currencies

Reuse the existing validated union in `entry-form.ts` as-is — do not invent a new list:

```
THB (home), JPY, KRW, USD, EUR, HKD, GBP, SGD
```

THB is the default and always sorts first in the picker.

## Ordering — auto most-used-first (no manual reorder)

The picker orders currencies by ledger usage, THB pinned first. Self-tunes per trip (JPY rises to
the top on a Japan trip) with zero reorder UI and zero persisted order. Mirrors how
`getKeypadAccounts` already orders accounts by usage.

New pure/query pieces in `src/features/entries/`:

- `queries.ts` → `getCurrencyCounts(db)`:
  `SELECT currency, count(id) FROM entries WHERE currency IS NOT NULL GROUP BY currency`,
  sorted count-desc (same shape as `getAccountsByUsage`).
- `keypad-lists.ts` → `getKeypadCurrencies(db): KeypadCurrency[]`: start from the full `CURRENCIES`
  union (so unused currencies still appear), order by `getCurrencyCounts`, then **pin THB first**.
  Returns `{ code, symbol }[]` where `symbol` comes from `currencySymbol(code)` (see money helper).

`KeypadCurrency = { code: Currency; symbol: string }`.

## FX source — Visa, cached, manual refresh, offline-tolerant

### Fetch (`src/features/entries/fx.ts`, new)

- `fetchVisaThbPerUnit(from: Currency, feePct: number): Promise<number>` — server-side `fetch` to
  `https://usa.visa.com/cmsapi/fx/rates` with query `amount=1&fee=<feePct>&utcConvertedDate=<mm/dd/yyyy>&exchangedate=<mm/dd/yyyy>&fromCurr=<from>&toCurr=THB`
  and a browser `User-Agent`. The `.com.sg` host is bot-walled (Cloudflare); `usa.visa.com` returns
  clean JSON with a plain fetch — use it.
- Parse `reverseAmount` / `fxRateWithAdditionalFee` into **THB per 1 unit of `from`** (fee-inclusive
  figure). Visa's field directions are quirky (the response labels `from`/`to` swapped vs the query),
  so a pure `parseVisaThbPerUnit(json)` does the extraction and has a self-check test.
- `feePct` is sent as Visa's `fee` param so the returned rate already includes the card markup.

### Cache (reuse the `settings` KV table)

- One JSON key `fx_rates`, value = `{ [code]: { thbPerUnit: number; asOf: string } }` (`asOf` = the
  `en-CA` date the rate was fetched). Stored via a new `settings/queries.ts` pair
  `getFxRates(db)` / `setFxRates(db, map)` following the existing delete-then-insert upsert pattern.
- Offline-tolerant: a refresh failure leaves the previous blob intact. Missing entry for a currency
  → keypad shows a "no rate — refresh in Settings or type one" prompt and still lets the user type a
  rate manually (per-entry override), so entry is never blocked.

### Refresh — manual button (no scheduler, no on-load fetch)

- Settings gets a "Refresh FX rates" button → `refreshFxRatesAction` (`settings/actions.ts`): loops
  the 7 foreign currencies, calls `fetchVisaThbPerUnit(code, cardFeePct)`, writes the blob,
  `revalidatePath('/', 'layout')`. Shows "as of <date>". A single failed pair keeps its last cached
  value rather than aborting the whole refresh.

## Card FX fee knob

- Settings key `card_fx_fee_pct`, default **2**. `getCardFeePct(db)` / `setCardFeePct(db, pct)` +
  `isValidCardFeePct` (0–10, one place) in `settings/queries.ts`, wired like the cutoff-day setting.
- Settings UI: a small number field ("Card FX fee %") + `setCardFeePctAction`. Sent as Visa's `fee`
  on refresh so stored THB ≈ the card statement.

## Money helper (`src/shared/money.ts`)

- Add `formatCurrency(amount, currency)` — memoized `Intl.NumberFormat` per code,
  `currencyDisplay: 'narrowSymbol'` (¥, ₩, $, €, HK$, £, S$, ฿). Intl picks correct fraction digits
  automatically (JPY/KRW → 0, others → 2). `formatBaht` stays for THB rollups.
- Add `currencySymbol(code)` — the narrowSymbol glyph alone, for the picker chips
  (via `Intl.NumberFormat(...).formatToParts(0)` → the `currency` part).
- Respects the project font rule: Intl figures, `tabular-nums`, no monospace.

## Keypad UI (`src/features/entries/ui/Keypad.tsx`)

New props: `currencies: KeypadCurrency[]`, `rates: Record<string, number>` (thbPerUnit),
`ratesAsOf: Record<string, string>`, `cardFeePct: number`. Defaults keep today's behaviour.

New state: `currency` (default `'THB'`), `rateOverride` (nullable per-entry rate).

- **Currency chip** in the existing date/account chip row (shows `symbol code`, e.g. `¥ JPY`;
  `฿ THB` by default). Tapping opens a **currency picker view** — same grid pattern as the account
  picker (a 4th view alongside keypad/account/category), tiles = `symbol` + `code`, tap sets the
  currency and returns.
- **THB selected (default):** identical to current behaviour. Big number is ฿, `currency=THB`,
  hidden `thb` = the amount (so `thb === amount`, matching the parser's THB branch).
- **Non-THB selected:**
  - Big number renders the **foreign** amount via `formatCurrency(amount, currency)` (`¥3,000`).
  - A line under the amount panel: `1 JPY = 0.2043 · ≈฿613` — the rate is **editable** (a small
    inline number input bound to `rateOverride`); clearing it falls back to the cached `rates[code]`.
  - Effective rate = `rateOverride ?? rates[code]`. Converted THB = `toThb(foreignAmount, rate)`
    (pure, rounded to whole THB — `formatBaht` shows 0 fraction digits anyway). One tiny test.
  - Hidden fields posted: `currency=<code>`, `amount=<foreign>`, `thb=<converted>`.
  - No cached rate **and** no override → the line prompts to refresh/type a rate and the
    Choose-category button is disabled (can't store THB we don't have).
- The "Choose category" gate additionally requires a positive effective THB for non-THB entries.

## Server components

`app/entries/new/page.tsx` and `app/entries/[id]/edit/page.tsx` load `getKeypadCurrencies(db)`,
`getFxRates(db)`, and `getCardFeePct(db)` and pass `currencies` / `rates` / `ratesAsOf` /
`cardFeePct` to `Keypad`. Edit mode pre-selects the row's stored `currency` and, for a non-THB row,
seeds the foreign amount from `originalAmount` and the rate override from
`abs(amount) / abs(originalAmount)`.

## Tests

- `fx.test.ts` — `parseVisaThbPerUnit` against the captured real JSON fixture (JPY→THB ≈ 0.2043);
  asserts the value lands in a sane band so a direction flip fails loudly.
- `money.test.ts` — `formatCurrency` for a 0-decimal (JPY) and a 2-decimal (USD) currency, plus
  `currencySymbol` glyphs.
- `keypad-lists.test.ts` — `getKeypadCurrencies` pins THB first and orders the rest by usage,
  including unused currencies at the tail.
- `toThb` — one pure conversion/rounding test.
- `settings/queries.test.ts` — `getFxRates`/`setFxRates` round-trip; `isValidCardFeePct` bounds.

## Out of scope (YAGNI)

- Trips integration (per-trip default currency) — later.
- Auto/scheduled refresh — manual button only.
- ECB / second-source fallback — single source; manual per-entry override covers failure.
- Editable currency list — the 8-currency union is fixed until a 9th country happens.
- Income/non-expense direction — keypad stays expense-only.
