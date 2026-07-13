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
