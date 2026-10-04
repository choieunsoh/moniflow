# FX converter (`/convert`) — design

**Date:** 2026-10-04 · **Branch:** `feat/fx-converter`

## Goal

A standalone exchange-rate calculator for two situations:

1. **Paying abroad** — "this tag says ¥1,200; what will my card actually charge in baht?"
2. **Planning a cash exchange** — "if I hand over ฿10,000, how many yen do I get?"

Enter an amount, pick a source and a destination currency (destination defaults to THB), and read
the result both **per 1 unit of the source** and **for the amount entered**, at four exchange-fee
levels: **+0%, +1%, +2%, +2.5%**.

It is a read-only tool: it never writes an entry.

## Non-goals

- Currencies outside the `/currency` catalog. Add one there to convert it.
- A new rate source, a new cache, or any schema change.
- Historical rates (date picker), favourites, or conversion history.
- Turning a conversion into an entry. The Keypad already converts foreign entries.

## Existing pieces reused

| Need | Already exists |
| --- | --- |
| Mid rates | `getFxRates(db)` → `{ [code]: { thbPerUnit, asOf } }` (ECB via frankfurter, cached in settings KV `fx_rates`) |
| Refresh | `refreshFxRatesAction()` in `features/settings/actions.ts` (offline-tolerant; keeps the old cache on failure) |
| Currency list | `listCurrencies(db)` (the catalog) |
| The user's real card fee | `getCardFeePct(db)` (default 2.5) |
| Read-hook plumbing | `withDb` (`@shared/db-effect`), `useDataVersion` |

## Fee rule (the one decision that matters)

**The fee always makes the foreign currency more expensive in baht.** The effective rate is

```
thbPerUnit_eff(code, fee) = code === 'THB' ? 1 : mid(code) × (1 + fee/100)
rate(from → to, fee)      = thbPerUnit_eff(from, fee) / thbPerUnit_eff(to, fee)
```

This is the same convention the Keypad uses for foreign entries, and one rule covers both directions:

- `JPY → THB`: rate × (1 + fee). The baht you **pay** goes up.
- `THB → JPY`: rate ÷ (1 + fee). The yen you **receive** goes down.

**Cross pair (neither side is THB, e.g. JPY → USD).** The fee falls on both sides and cancels out, so
all four rows would print the same figure. For a cross pair, show **only the +0% row**, with the note
"Mid rate — card fees apply in baht". Real cards charge the FX fee in the home currency, so a
foreign↔foreign mid rate is the honest answer.

**Single rule for the row count:** show all four fee rows only when **exactly one side is THB**;
otherwise show just the +0% row. That one rule covers the cross pair and the same-currency case
(`from === to`, result 1:1), so neither needs special-casing.

## UI

```
┌ Convert ───────────────────────────┐
│ [ 1,200                         ]  │  <input inputmode="decimal">
│ [ JPY ▾ ]      ⇄      [ THB ▾ ]    │  native <select>s + swap button
│ ECB rate · 3 Oct 2026   ↻ Refresh  │
│                                    │
│ Fee      per ¥1         ¥1,200     │
│ +0%      ฿0.2210        ฿265.20    │
│ +1%      ฿0.2232        ฿267.85    │
│ +2%      ฿0.2254        ฿270.50    │
│ +2.5% ★  ฿0.2265        ฿271.83    │  ★ = equals Settings → card FX fee
└────────────────────────────────────┘
```

- **Amount** is a plain `<input type="text" inputmode="decimal">`, not the Keypad. The Keypad is
  bound to entry creation (category/account/save); the native decimal keyboard is enough here.
- **★ marker:** the row whose fee equals `getCardFeePct`. If the user's fee is not one of the four
  (say 1.5%), no row is starred. The four rows stay fixed by request.
- **Empty or invalid amount:** render the fee and per-1 columns and hide the total column.
  Valid means a finite number > 0 after stripping thousands separators.
- **Missing rate:** if either side has no cached rate, replace the table with
  "No rate for JPY yet" and a Refresh button. Never print a fabricated number.
- **Rate date:** `asOf` of the source's rate (or the destination's, if the source is THB), formatted
  in Bangkok tz with the existing date helpers.
- **Figures:** the system-sans stack with `tabular-nums` (no monospace, per global rules).
  - Per-1 column: **4 dp** (฿0.2210 needs them).
  - Total column: the destination currency's own minor units, via
    `Intl.NumberFormat(..., { style: 'currency', currency: to })`.
  - THB figures keep the app's `฿` look. Use `formatBaht` when `to === 'THB'`.
- **Privacy blur applies to every figure** (header amount, per-1 rate, totals), like the rest of the app — each goes through `<Money>`. The typed amount input is not blurred.

## State

URL search params, following the app's convention: `?from=JPY&to=THB&amt=1200`.

- `to` defaults to `THB`.
- `from` defaults to the first non-THB **visible** catalog currency. With only THB in the catalog,
  show an empty state linking to `/currency`.
- An unknown code in the URL falls back to the default.
- The amount is written to the URL with `router.replace` (no history spam). Swap exchanges `from`
  and `to` and keeps `amt`.

## Modules

| File | Role |
| --- | --- |
| `src/features/currencies/convert.ts` | **Pure.** `convertRows({ amount, from, to, rates, fees }) → { feePct, perUnit, total \| null }[] \| { missing: code }`. Owns the fee rule, the cross-pair collapse and amount parsing. |
| `src/features/currencies/convert.test.ts` | Both directions, cross pair → single row, same currency, missing rate, invalid amount → `total: null`. |
| `src/features/currencies/use-convert.ts` | Read hook via `withDb`: catalog + `getFxRates` + `getCardFeePct` → `{ ready, data }`. Refetches on `useDataVersion`, so Refresh updates the page. |
| `src/features/currencies/use-convert.test.ts` | `renderHook` against the Node shim. |
| `src/features/currencies/ui/Converter.tsx` | Thin component: inputs, swap, table, ★. |
| `src/features/currencies/ui/Converter.test.tsx` | Swap exchanges codes; ★ follows the card fee; cross pair shows one row. |
| `src/app/convert/page.tsx` | `'use client'` route; reads search params, delegates to `Converter`. |
| `src/shared/ui/MoreSheet.tsx` | Add `{ href: '/convert', label: 'Convert', Icon: ArrowLeftRight }` to the **Plan** group after Recurring — it fills Plan's short row; a fourth tile under Lists would orphan. |
| `src/app/manifest.ts` | Add `{ name: 'Convert currency', short_name: 'Convert', url: '/convert' }` to `shortcuts`. |

The feature lives in `features/currencies/` because it consumes only currency data.
`getFxRates`/`getCardFeePct` stay where they are, in settings. That is an existing feature-to-feature
read, the same one `use-currencies.ts` already makes.

## Testing and verification

- TDD on `convert.ts` first. Its arithmetic is the whole correctness story.
- Gates: `format:files` → `typecheck` → `lint` → `format:check` → `test`.
- In a browser at 412px, on dev (`127.0.0.1:4010`):
  - JPY→THB with the four rows and ★;
  - swap to THB→JPY, where the totals now **decrease** with the fee;
  - a cross pair, which shows one row and the note;
  - empty amount;
  - the More sheet entry (Plan group).
  - Also check the manifest shortcut in the manifest output. A launcher shortcut can only be
    exercised on an installed PWA.

## Open risks

- The ECB has no fixing for some currencies people travel with (e.g. VND, TWD aren't in the
  frankfurter set). Those can't be in the catalog with a rate today, so the "No rate" state covers
  them. No new behaviour is needed.
