import type { Currency } from './entry-form';

// Pure FX helpers for the keypad currency feature. No network and no DB here — the actual rate fetch
// lives in settings/actions.ts (server) and imports frankfurterUrl + parseEcbResponse from this
// module. Kept pure so it is safe to import from the client Keypad (for toThb) too.
//
// Source: the European Central Bank daily reference rates via frankfurter.dev (free, no key, plain
// HTTPS — works from Node/serverless, unlike Visa's Cloudflare-walled endpoint). This is the
// interbank MID rate, ~0.5–1% below what a Visa card actually charges; the card-fee knob (see
// withFee) layers that markup back on top so stored THB approximates the statement.

// The frankfurter query URL: one call for every non-THB currency, based in THB. Response shape is
// { base:'THB', date:'YYYY-MM-DD', rates:{ JPY: <JPY per 1 THB>, ... } } — note the rates are
// foreign-per-THB, so parseEcbResponse inverts them to THB-per-foreign.
export function frankfurterUrl(currencies: readonly Currency[]): string {
  const symbols = currencies.filter((c) => c !== 'THB').join(',');
  return `https://api.frankfurter.dev/v1/latest?base=THB&symbols=${symbols}`;
}

// Parse a frankfurter response into the fixing date + a { code → THB-per-1-unit } map (inverting the
// foreign-per-THB rates). Throws on a missing/misshaped payload or if no usable rate survives, so a
// response-shape change fails loudly instead of caching garbage.
export function parseEcbResponse(json: unknown): {
  date: string;
  thbPerUnit: Record<string, number>;
} {
  if (typeof json !== 'object' || json === null || !('rates' in json) || !('date' in json)) {
    throw new Error('ECB response missing rates or date');
  }
  const rawRates = json.rates;
  if (typeof rawRates !== 'object' || rawRates === null) {
    throw new Error('ECB response rates is not an object');
  }
  const thbPerUnit: Record<string, number> = {};
  for (const [code, value] of Object.entries(rawRates)) {
    const perThb = Number(value);
    if (Number.isFinite(perThb) && perThb > 0) {
      thbPerUnit[code] = 1 / perThb; // foreign-per-THB → THB-per-foreign
    }
  }
  if (Object.keys(thbPerUnit).length === 0) {
    throw new Error('ECB response had no usable rates');
  }
  return { date: String(json.date), thbPerUnit };
}

// Layer the card's FX markup onto the ECB mid-rate. The mid-rate understates the real card charge,
// so the fee (Visa's ~0.5% network markup + the user's bank foreign-transaction fee) is added on
// top: effectiveRate = mid × (1 + feePct/100). Tuned once against a real statement.
export function withFee(baseRate: number, feePct: number): number {
  return baseRate * (1 + feePct / 100);
}

// Foreign amount → THB at an already-fee-inclusive (effective) rate, rounded to satang: the smallest
// real THB unit, and exactly the precision formatBaht renders, so what's stored agrees with what's
// shown. Rounding to satang (not skipping the round) also keeps the product of two reals from leaking
// IEEE-754 drift into the ledger — 107 × 34.1234 is 3651.2038000000004.
//
// This rounded to WHOLE baht until money.ts started stating satang (฿3,651.20). Once display gained
// its two digits, the whole-baht round here became a silent write-time loss of up to 50 satang on
// every foreign entry, surfacing as a keypad that answered "= ฿3,651.00" to arithmetic reading
// 3,651.20. THB entries never went through here and kept their satang, so the two paths disagreed.
// Don't reintroduce the whole-baht round: the ledger has fraction digits now.
export function toThb(foreign: number, effectiveRate: number): number {
  return Math.round(foreign * effectiveRate * 100) / 100;
}
