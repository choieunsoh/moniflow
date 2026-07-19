import type { Db } from '@db/client';
import { getBrowserDb } from '@db/browser';

// Run a read effect against the browser db, treating "the db won't open" as a condition rather than
// an error.
//
// Every read hook is `useEffect(() => { void (async () => { const db = await getBrowserDb(); … })() })`,
// and a `void`-ed async IIFE with no catch turns any rejection into an unhandled one. That cost
// nothing while a failed OPFS boot hung forever instead of rejecting — but once the worker started
// reporting the failure properly, one blocked boot became seventeen unhandled rejections, one per
// mounted hook, all describing a situation useDbHealth already states once in the shell.
//
// The obvious fix — a blanket .catch on each hook — would have swallowed query errors too. Those are
// bugs, not conditions: silencing one strands the hook not-ready and leaves the page on a loading
// skeleton forever with nothing in the console to explain it. So the two are split deliberately:
//
//   db won't open  → resolve quietly; the shell owns that message.
//   effect throws  → propagate; a broken query should be as loud as it is today.
export async function withDb(run: (db: Db) => Promise<void>): Promise<void> {
  let db: Db;
  try {
    db = await getBrowserDb();
  } catch {
    return;
  }
  await run(db);
}
