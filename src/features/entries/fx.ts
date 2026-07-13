import type { Currency } from './entry-form';

// Pure FX helpers for the keypad currency feature. No network and no DB here — the actual Visa
// fetch lives in settings/actions.ts (server) and imports visaRatesUrl + parseVisaThbPerUnit from
// this module. Kept pure so it is safe to import from the client Keypad (for toThb) too.

// Visa's consumer FX endpoint reports `fxRateVisa` = THB per 1 unit of the target currency when
// called as fromCurr=THB&toCurr=<X> (verified against Visa's own website: USD → 33.469967,
// JPY → 0.207553). This figure already includes Visa's per-currency network markup over the ECB
// mid-rate (which is dynamic — 0.47% for USD, 0.85% for JPY — so we take Visa's marked-up number
// directly rather than reconstructing it). NOTE the direction: querying the other way
// (fromCurr=<X>&toCurr=THB) makes the endpoint apply the markup to the wrong leg and `fxRateVisa`
// comes back below the mid-rate. We read this one field and assert it is a positive finite number —
// a response-shape change then throws instead of caching garbage.
export function parseVisaThbPerUnit(json: unknown): number {
  if (typeof json !== 'object' || json === null || !('fxRateVisa' in json)) {
    throw new Error('Visa FX response missing fxRateVisa');
  }
  const rate = Number(json.fxRateVisa);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Visa FX rate is not a positive number: ${String(json.fxRateVisa)}`);
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

// The usa.visa.com query URL for THB → one foreign currency, fee=0 (Visa markup only, no bank fee).
// Direction matters: fromCurr=THB&toCurr=<X> yields `fxRateVisa` = THB per 1 X (see parse note).
// Date must be MM/DD/YYYY; URLSearchParams encodes the slashes to %2F. The .com.sg host is
// Cloudflare-bot-walled — use usa.visa.com. Note: Node's fetch is also Cloudflare-challenged on this
// host, so the caller fetches via a curl subprocess (see settings/actions.ts), not fetch().
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
    fromCurr: 'THB',
    toCurr: from,
  });
  return `https://usa.visa.com/cmsapi/fx/rates?${params.toString()}`;
}
