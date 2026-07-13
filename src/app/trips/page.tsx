// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getForeignEntries } from '@features/entries/queries';
import { groupIntoTrips, formatForeign, formatTripRange, tripDays } from '@features/entries/trips';
import { formatBaht } from '@shared/money';
import { PageContainer } from '@shared/ui/PageContainer';

export default function TripsPage() {
  const db = initDb();
  ensureEntriesTable(db);
  const trips = groupIntoTrips(getForeignEntries(db));

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Trips</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Foreign-currency spending, grouped into trips by currency and date.
        </p>
      </header>

      {trips.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">No foreign-currency entries yet</h2>
          <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            Trips are built from JPY/HKD entries in the ledger. Import or add some non-THB entries
            to see them grouped here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {trips.map((trip) => (
            <li key={`${trip.currency}-${trip.start}`}>
              {/* Tap a trip to open its records — the same currency within its date range. */}
              <Link
                href={`/records?currency=${trip.currency}&from=${trip.start}&to=${trip.end}`}
                className="panel flex flex-col gap-3 p-5 transition-colors"
                style={{ background: 'var(--color-surface)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="chip">{trip.currency}</span>
                  <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    {formatTripRange(trip)}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    {tripDays(trip)} days · {trip.count} {trip.count === 1 ? 'entry' : 'entries'}
                  </span>
                  <div className="flex items-baseline gap-3">
                    <span className="tnum text-lg font-semibold">
                      {formatForeign(trip.originalTotal, trip.currency)}
                    </span>
                    <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                      {formatBaht(trip.thbTotal)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
