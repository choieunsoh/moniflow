// GET /settings/backup/export — streams the whole ledger as a Monefy-compatible CSV download.
// force-dynamic: reads better-sqlite3 per request (can't be prerendered), same as every page.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getEntries } from '@features/entries/queries';
import { serializeMonefyCsv } from '@features/entries/import';
import { todayIso } from '@shared/date';

export function GET(): Response {
  const db = initDb();
  ensureEntriesTable(db);
  const csv = serializeMonefyCsv(getEntries(db));
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="moniflow-${todayIso()}.csv"`,
    },
  });
}
