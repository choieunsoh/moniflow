import type { Db } from '@db/client';
import { frankfurterUrl, parseEcbResponse, withFee, toThb } from '@features/entries/fx';
import { isCurrency } from '@features/entries/entry-form';
import { getCardFeePct, getFxRates } from '@features/settings/queries';

// Which THB rate a recurring post converts at, and the ledger values that follow.
//
// The order is: a pinned rate wins outright → THB needs no rate → otherwise fetch the ECB fixing for
// THE DUE DATE (not today) and layer the card fee → and if that fails, use the cached rate rather
// than block the ledger. Only a foreign rule with no rate anywhere throws, and the sweep catches
// per-rule so it retries on the next app open.

export type RateRule = { currency: string | null; rate: number | null };
export type Converted = { amount: number; currency: string | null; originalAmount: number | null };

// One sweep's worth of ECB fixings, keyed by `${code}:${date}` — memoises fetchMid so two rules
// sharing a currency AND due date hit the network once, not twice. Callers create one of these per
// `runSweep` and discard it when the sweep ends; nothing here is a persistent cache (that's
// getFxRates/setFxRates, a separate fallback for when the network is unavailable at all).
export type MidCache = Map<string, number | null>;

// A rule with no currency, or an explicit THB one, is a plain baht bill.
function isPlainThb(rule: RateRule): boolean {
  return rule.currency === null || rule.currency === 'THB';
}

// The ECB mid-rate for one currency on one date, or null on any failure — offline-tolerant by
// design, mirroring refreshFxRatesAction's swallow-and-keep-the-cache shape.
async function fetchMid(
  code: string,
  date: string,
  validCodes: Set<string>,
): Promise<number | null> {
  if (!isCurrency(code, validCodes)) return null;
  try {
    const res = await fetch(frankfurterUrl([code], date), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseEcbResponse(json).thbPerUnit[code] ?? null;
  } catch {
    return null;
  }
}

// The effective (fee-inclusive) THB-per-unit rate for a rule's post on `date`. `midCache`, when
// passed, is checked/filled before/after the network call — see MidCache above. `validCodes` is the
// catalog's codes (Task 2's getCurrencyCodes) — resolveRate stays a pure consumer of the set, never
// reading the currencies table itself.
export async function resolveRate(
  db: Db,
  rule: RateRule,
  date: string,
  validCodes: Set<string>,
  midCache?: MidCache,
): Promise<number> {
  // A pinned rate is what the user's statement actually charged — the fee is already baked into the
  // number they typed, so withFee must NOT be applied on top of it.
  if (rule.rate !== null) return rule.rate;

  const code = rule.currency;
  if (code === null) throw new Error('resolveRate: called for a rule with no currency');
  if (!isCurrency(code, validCodes)) throw new Error(`resolveRate: unknown currency "${code}"`);

  const feePct = await getCardFeePct(db);
  const key = `${code}:${date}`;
  let mid = midCache?.get(key);
  if (mid === undefined) {
    mid = await fetchMid(code, date, validCodes);
    midCache?.set(key, mid);
  }
  if (mid !== null) return withFee(mid, feePct);

  const cached = (await getFxRates(db))[code];
  if (cached === undefined) {
    throw new Error(`resolveRate: no rate for ${code} on ${date} and nothing cached`);
  }
  return withFee(cached.thbPerUnit, feePct);
}

// A rule's positive amount → the ledger's signed values. `originalAmount` is stored SIGNED, the same
// sign as `amount` — matching entry-form.ts:62 (`originalAmount: sign * amount`), so a recurring
// foreign row is indistinguishable from a hand-entered one.
export async function convertAmount(
  db: Db,
  rule: RateRule & { amount: number },
  date: string,
  validCodes: Set<string>,
  midCache?: MidCache,
): Promise<Converted> {
  if (isPlainThb(rule)) {
    return { amount: -rule.amount, currency: rule.currency, originalAmount: null };
  }
  const rate = await resolveRate(db, rule, date, validCodes, midCache);
  return {
    amount: -toThb(rule.amount, rate),
    currency: rule.currency,
    originalAmount: -rule.amount,
  };
}
