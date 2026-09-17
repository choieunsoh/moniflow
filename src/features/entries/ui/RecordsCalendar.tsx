import Link from 'next/link';
import type { RecordsCalendar as CalendarData } from '../use-records';
import type { IconSet } from '@features/settings/queries';
import { emojiFor, hueFor } from '@features/categories/queries';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { formatDayHeading } from '@shared/date';
import { formatLedgerSpend } from '@shared/money';
import { Money } from '@shared/ui/Money';
import { formatForeign } from '../trips';
import { CalendarGrid, DayMark } from './CalendarGrid';
import { SwipeRow } from './SwipeRow';

// The Records calendar: the cycle as a tappable month grid, then the selected day's rows. Entries use
// the same SwipeRow as every other Records view (tap to edit, swipe to delete, Undo). Upcoming bills
// come last as muted rows that open their rule. They have not happened, so they stay out of the day
// total.
export function RecordsCalendar({
  calendar,
  hrefFor,
  emojiMap,
  hueMap,
  iconSet,
}: {
  calendar: CalendarData;
  hrefFor: (date: string) => string;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
}) {
  const { cells, marks, selectedDay, dayEntries, dayTotal, dayBills } = calendar;
  const heading = formatDayHeading(selectedDay);
  return (
    <>
      <section className="panel p-3" aria-label="Calendar">
        <CalendarGrid cells={cells} marks={marks} selectedDay={selectedDay} hrefFor={hrefFor} />
      </section>
      <section className="flex flex-col gap-2" aria-label={`Records on ${heading}`}>
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">
            {heading}{' '}
            <span className="tnum font-normal" style={{ color: 'var(--color-muted)' }}>
              ({dayEntries.length})
            </span>
          </h2>
          <span className="tnum text-sm">
            <Money>{formatLedgerSpend(dayTotal)}</Money>
          </span>
        </div>
        {dayEntries.length === 0 && dayBills.length === 0 ? (
          <p
            className="panel px-4 py-6 text-center text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            Nothing on this day
          </p>
        ) : (
          <ul className="panel flex flex-col divide-y overflow-hidden">
            {dayEntries.map((entry) => (
              <SwipeRow
                key={entry.id}
                entry={entry}
                emoji={emojiFor(emojiMap, entry.category)}
                iconSet={iconSet}
                hue={hueFor(hueMap, entry.category)}
              />
            ))}
            {dayBills.map((bill) => (
              <li key={`bill-${bill.id}`}>
                <Link
                  href={`/recurring/edit?id=${bill.id}`}
                  className="tap flex items-center gap-3 px-4 py-2"
                  style={{ color: 'var(--color-muted)' }}
                >
                  <CategoryIcon
                    emoji={emojiFor(emojiMap, bill.category ?? '')}
                    name={bill.category ?? bill.name}
                    iconSet={iconSet}
                    hue={hueFor(hueMap, bill.category ?? '')}
                    size="sm"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{bill.name}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <DayMark kind="upcoming" />
                      Bill due
                    </span>
                  </span>
                  <span className="tnum text-sm">
                    <Money>
                      {bill.currency === 'THB'
                        ? formatLedgerSpend(-bill.amount)
                        : formatForeign(bill.amount, bill.currency)}
                    </Money>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
