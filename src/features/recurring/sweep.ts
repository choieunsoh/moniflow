import type { Db } from '@db/client';
import { listRules, markPosted, postRecurringEntries, type PostRow } from './queries';
import { duePosts, noteFor } from './schedule';
import { convertAmount, type MidCache } from './rates';
import { getCurrencyCodes } from '@features/currencies/queries';

// THE SCHEDULER. There is no server and therefore no cron, so opening the app IS the schedule: this
// walks every active rule, posts whatever came due while the app was closed (dated its real due
// date), and advances each rule's pointer.
//
// Idempotence comes from the pointer, not from a lock: swept twice in a day, duePosts returns [] the
// second time. No "last swept" timestamp is stored anywhere.
//
// Takes todayIso as an argument rather than reading a clock, so it is testable and the date policy
// stays at the caller's boundary.
export async function runSweep(db: Db, todayIso: string): Promise<number> {
  let posted = 0;
  // One fetch per distinct (currency, date) for the whole sweep — two rules sharing a currency and
  // due date hit the network once. Lives only for this call; never persisted or reused across sweeps.
  const midCache: MidCache = new Map();
  const validCodes = await getCurrencyCodes(db);
  for (const rule of await listRules(db)) {
    const due = duePosts(rule, todayIso);
    if (due.length === 0) continue;
    try {
      const rows: PostRow[] = [];
      for (const { date, seq } of due) {
        const { amount, currency, originalAmount } = await convertAmount(
          db,
          rule,
          date,
          validCodes,
          midCache,
        );
        rows.push({
          date,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          amount,
          currency,
          originalAmount,
          note: noteFor(rule, seq),
        });
      }
      await postRecurringEntries(db, rows);
      await markPosted(db, rule.id, due[due.length - 1].date);
      posted += rows.length;
    } catch {
      // One unresolvable rule (a foreign rule with no rate fetched AND none cached) must not stop
      // the others. Its pointer is left untouched, so the next app open retries it.
      continue;
    }
  }
  return posted;
}
