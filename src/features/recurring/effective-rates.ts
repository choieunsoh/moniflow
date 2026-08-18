import type { Db } from '@db/client';
import { getCardFeePct, getFxRates } from '@features/settings/queries';
import { withFee } from '@features/entries/fx';

// The effective (fee-inclusive) THB-per-unit rate for every currency the app has a cached fixing
// for — what committedThisCycle needs to reserve a live-FX bill in real money instead of at its
// face amount.
//
// Reads ONLY local state: the cached fixings in settings' fx_rates plus the card fee. No network,
// so a Home or Budgets render never waits on Frankfurter, and an offline device reserves from the
// last rates it saw rather than reverting to a 30x under-reservation.
//
// The fee belongs in here, not at the call site: resolveRate applies withFee to every unpinned rate
// on the way into the ledger, so a reservation that skipped it would sit consistently under what the
// bill will actually cost — the same direction of error this whole function exists to close.
export async function getEffectiveRates(db: Db): Promise<Map<string, number>> {
  const [rates, feePct] = await Promise.all([getFxRates(db), getCardFeePct(db)]);
  const out = new Map<string, number>();
  for (const [code, entry] of Object.entries(rates))
    out.set(code, withFee(entry.thbPerUnit, feePct));
  return out;
}
