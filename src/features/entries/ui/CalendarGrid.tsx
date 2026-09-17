import Link from 'next/link';
import type { HeatmapCell } from '../heatmap';
import { toCalendarLayout } from '../heatmap';
import type { DayMarks } from '../calendar-marks';
import { formatBahtWhole } from '@shared/money';
import { formatDayHeading } from '@shared/date';

type Ink = 'muted' | 'text' | 'surface';

// intensity 0..4 → how much --color-text is mixed into --color-surface-2, and which ink the day number
// and its marks draw in on top. Hue-free, so category colour keeps its meaning. Each ink is pinned
// against its own background in globals.test.ts (4.5:1, both themes): the midpoint of the old
// 25/50/75 ramp had NO ink that cleared both themes, and the top step drew text on text. `srgb`, not
// `oklab`, so the test's per-channel composite is exactly what the browser paints.
export const RAMP = [
  { mix: 0, ink: 'muted' },
  { mix: 15, ink: 'text' },
  { mix: 30, ink: 'text' },
  { mix: 65, ink: 'surface' },
  { mix: 100, ink: 'surface' },
] as const satisfies readonly { mix: number; ink: Ink }[];

function background(mix: number): string {
  return mix === 0
    ? 'var(--color-surface-2)'
    : `color-mix(in srgb, var(--color-text) ${mix}%, var(--color-surface-2))`;
}

// Sunday-started narrow weekday labels (S M T W T F S), derived via Intl from a known Sunday
// (2023-01-01) rather than hard-coded letters, so they stay correct if the locale ever changes.
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' });
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  weekdayFmt.format(new Date(Date.UTC(2023, 0, 1 + i))),
);

// The day-of-month for a YYYY-MM-DD key (the trailing DD as a number — no zero-pad to display).
function dayOfMonth(date: string): number {
  return Number(date.split('-')[2]);
}

const KINDS = ['posted', 'upcoming', 'offBudget', 'refund'] as const;
const WORDS: Record<keyof DayMarks, string> = {
  posted: 'bill posted',
  upcoming: 'bill due',
  offBudget: 'off-budget',
  refund: 'refund',
};
const LEGEND: Record<keyof DayMarks, string> = {
  posted: 'Bill posted',
  upcoming: 'Bill due',
  offBudget: 'Off-budget',
  refund: 'Refund',
};

// A small CSS shape in currentColor — filled dot, ring, diamond, plus — rather than a ●○◆+ text glyph,
// whose size and even presence vary by font fallback. Inherits the cell ink, so it carries the ramp's
// contrast guarantee for free. The plus echoes how the ledger prints a refund, +฿. Its box is a fixed
// 6px, not the rem-based size-1.5 the others use: its two 2px bars sit at 2px–4px, and a rem box grows
// with the font-scale setting (6.75px at 112.5%), which would push the bars off-centre.
export function DayMark({ kind }: { kind: keyof DayMarks }) {
  if (kind === 'refund') {
    return (
      <span aria-hidden="true" className="relative block size-[6px] shrink-0">
        <span className="absolute inset-x-0 top-[2px] block h-[2px] bg-current" />
        <span className="absolute inset-y-0 left-[2px] block w-[2px] bg-current" />
      </span>
    );
  }
  const shape =
    kind === 'posted'
      ? 'rounded-full bg-current'
      : kind === 'upcoming'
        ? 'rounded-full border border-current'
        : 'rotate-45 bg-current';
  return <span aria-hidden="true" className={`block size-1.5 shrink-0 ${shape}`} />;
}

// A real month-calendar of a billing cycle: weekday columns, each day under its own weekday, darker =
// more discretionary spend, glyph marks for bills, off-budget spend and refunds. Days run
// continuously across the month boundary (…31, 1…) because the cycle is a billing cycle, not a
// calendar month.
//
// Two modes. Without `hrefFor` (Trends) it is a non-interactive glance, as it always was: empty days
// are aria-hidden. With `hrefFor` (Records) every day is a link that selects it — `replace` so tapping
// through days doesn't fill the back stack, `scroll={false}` so the grid doesn't jump to the top — and
// every day names its figure and marks in words.
export function CalendarGrid({
  cells,
  marks,
  selectedDay,
  hrefFor,
}: {
  cells: HeatmapCell[];
  marks?: ReadonlyMap<string, DayMarks>;
  selectedDay?: string;
  hrefFor?: (date: string) => string;
}) {
  const layout = toCalendarLayout(cells);
  const allMarks = [...(marks?.values() ?? [])];
  const present = KINDS.filter((k) => allMarks.some((m) => m[k]));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <span
            key={i}
            className="text-center text-[11px]"
            style={{ color: 'var(--color-muted)' }}
            aria-hidden="true"
          >
            {w}
          </span>
        ))}
        {layout.map((c, i) => {
          if (c === null) return <span key={`pad-${i}`} aria-hidden="true" />;
          const step = RAMP[c.intensity] ?? RAMP[0];
          const kinds = KINDS.filter((k) => marks?.get(c.date)?.[k] === true);
          const spent = c.total > 0;
          // A day names what moved: its figure, then its marks. "no spending" only when neither —
          // beside a mark it would read as a contradiction ("no spending, bill posted").
          const words = kinds.map((k) => WORDS[k]);
          const parts = spent
            ? [formatBahtWhole(c.total), ...words]
            : words.length > 0
              ? words
              : ['no spending'];
          const label = `${formatDayHeading(c.date)}: ${parts.join(', ')}`;
          const selected = c.date === selectedDay;
          const className = `tnum flex aspect-square flex-col items-center justify-center gap-0.5 rounded text-[11px]${
            selected ? ' outline-2 outline-offset-1' : ''
          }`;
          const style = {
            background: background(step.mix),
            color: `var(--color-${step.ink})`,
            outlineColor: 'var(--color-text)',
          };
          const body = (
            <>
              <span>{dayOfMonth(c.date)}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {kinds.map((k) => (
                  <DayMark key={k} kind={k} />
                ))}
              </span>
            </>
          );
          if (hrefFor !== undefined) {
            return (
              <Link
                key={c.date}
                href={hrefFor(c.date)}
                replace
                scroll={false}
                prefetch={false}
                aria-label={label}
                aria-current={selected ? 'date' : undefined}
                className={className}
                style={style}
              >
                {body}
              </Link>
            );
          }
          return (
            <span
              key={c.date}
              className={className}
              style={style}
              title={spent ? label : undefined}
              aria-label={spent ? label : undefined}
              aria-hidden={spent ? undefined : true}
            >
              {body}
            </span>
          );
        })}
      </div>
      {present.length > 0 ? (
        <p
          className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs"
          style={{ color: 'var(--color-muted)' }}
        >
          {present.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <DayMark kind={k} />
              {LEGEND[k]}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
