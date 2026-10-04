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
