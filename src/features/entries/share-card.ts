import { formatBahtWhole } from '@shared/money';
import type { BudgetTotal } from '@features/budgets/budget-status';
import { drawnTotal, type DonutSlice } from './donut';
import { tomorrowAllowance } from './dashboard';
import type { DayPace } from './day-pace';

// The cycle summary, reduced to the handful of strings a shareable image can hold. Pure and
// formatted here so the renderer (ui/ShareCardButton) only positions text on a canvas — the same
// split the charts use, and the reason this file is the only part of the feature with tests.
//
// A share card is not the Home page shrunk: a phone screenshot already does that, badly (browser
// chrome, bottom bar, whatever was mid-scroll). This states the cycle's answer and nothing else.

// `over` marks a remainder that has gone negative. The value already carries a true minus, so the
// renderer's colour is the SECOND signal, never the only one — the sign survives grayscale.
export type ShareKpi = { label: string; value: string; over?: boolean };

// One list, carrying both the wedge (value, color) and its caption (amount, share). They were two
// lists for one draft, and that is exactly how a ring and its legend drift apart.
export type ShareRow = {
  name: string;
  value: number;
  amount: string;
  share: string;
  color: string;
};

export type ShareCard = {
  title: string;
  // When the card was made, for the footer. A shared image outlives the screen it came from — six
  // weeks later "Left per day ฿440" is a claim about a cycle nobody can date any more, and the title
  // gives the cycle, not the moment inside it that these forward figures were true.
  generatedAt: string;
  headlineLabel: string;
  headline: string;
  kpis: ShareKpi[];
  rows: ShareRow[];
};

export type ShareCardInput = {
  label: string;
  grossSpend: number;
  count: number;
  slices: DonutSlice[];
  totalStatus: BudgetTotal | null;
  // Current-cycle-only figures; null on a past cycle, exactly as useHome hands them over.
  forward: {
    safePerDay: number | null;
    daysLeft: number;
    // Today's allowance frozen at the start of the day, and what has been spent against it — the
    // pair Home's TodayAllowanceCard renders. Both are needed: the tile states the REMAINDER.
    todayAllowance: number | null;
    spentToday: number;
  } | null;
  // How the cycle's finished days landed against their allowance. null without a total budget, and
  // on a cycle's first day. Unlike `forward` this survives on a past cycle — see day-pace.ts.
  dayPace: DayPace | null;
  // Passed in rather than read from the clock here, so the stamp is assertable.
  now: Date;
};

// Bangkok, like every other user-facing date in the app — the zone its cycles are reckoned in.
// hourCycle 'h23' rather than hour12:false: the two are not synonyms, and en-GB resolves the latter
// to h24, which prints midnight as 24:00 on the wrong date's card.
const stampFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Bangkok',
});

// dd/MM/yyyy HH:mm. en-GB separates the date from the time with ", " and the house format wants a
// bare space, so the comma comes out of the literal PARTS — the same way formatDayHeadingWithYear
// drops its own, and never by string surgery on an already-formatted date.
function formatStamp(now: Date): string {
  return stampFmt
    .formatToParts(now)
    .map((part) => (part.type === 'literal' ? part.value.replace(',', '') : part.value))
    .join('');
}

// Four tiles is what the card's width takes before the figures start shrinking to fit; the renderer
// measures and steps the type down rather than overflowing, but a fifth would leave every value at
// its smallest size on the widest cycle.
const MAX_KPIS = 4;

// A remainder tile: the label stays put and the figure changes sign. Home's cards flip their titles
// instead ("Over today's allowance"), and that is right for a full-width card with room for a
// sentence — but a KPI tile is a quarter of a canvas row with no wrapping, so a longer caption only
// shrinks the number it captions. Here the constant label is the axis and the sign is the news.
function remainder(label: string, amount: number): ShareKpi {
  return amount < 0
    ? { label, value: `−${formatBahtWhole(-amount)}`, over: true }
    : { label, value: formatBahtWhole(amount) };
}

export function buildShareCard(input: ShareCardInput): ShareCard {
  const { label, grossSpend, count, slices, totalStatus, forward, dayPace, now } = input;
  // The ring's own sum, never `grossSpend`: every drawn slice is a positive magnitude while the
  // headline is the signed net, so on a cycle with refunds the two differ by exactly the refunded
  // amount and shares divided by the headline overshoot 100%.
  const ringTotal = drawnTotal(slices);
  const tomorrow =
    forward === null || forward.safePerDay === null
      ? null
      : tomorrowAllowance(forward.safePerDay, forward.daysLeft);
  // The same subtraction TodayAllowanceCard does, so the card and the screen it came from state one
  // figure between them rather than two that nearly agree.
  const leftToday =
    forward === null || forward.todayAllowance === null
      ? null
      : forward.todayAllowance - forward.spentToday;

  // EVERY wedge gets a caption — there is no separate cap here on purpose. The ring already folded
  // its tail into Other at MAX_SLICES, so the list is at most eight rows and the shares sum to 100%;
  // a second cap on top of that fold would leave wedges on the card that nothing names. Sorted by
  // size because toDonutSlices appends Other LAST regardless of how big it is, and on a long-tailed
  // cycle that bucket outranks half the categories above it.
  const rows = [...slices]
    .sort((a, b) => b.value - a.value)
    .map((s) => ({
      name: s.name,
      value: s.value,
      amount: formatBahtWhole(s.value),
      share: `${ringTotal === 0 ? 0 : Math.round((s.value / ringTotal) * 100)}%`,
      color: s.color,
    }));

  // Priority order, filtered by what this cycle actually has. Budget first (it is the only figure
  // here with a target behind it), then the rate it implies, then the two counts that always exist —
  // so a past cycle with no budget still fills the row instead of leaving a gap.
  const candidates: (ShareKpi | null)[] = [
    totalStatus === null || totalStatus.limit === null
      ? null
      : remainder('Left of budget', totalStatus.remaining),
    leftToday === null ? null : remainder('Left today', leftToday),
    // Tomorrow's figure if nothing more is spent today, from the same helper the Home card prints —
    // it drops out on the cycle's last day, when there is no tomorrow left to spread anything over.
    tomorrow === null ? null : { label: 'Tomorrow', value: formatBahtWhole(tomorrow) },
    // The cycle's discipline in one figure — the days that stayed inside their allowance, out of
    // the days that have finished. Ranked ABOVE 'Days left' because it is the only backward-looking
    // figure on the card and 'Days left' is already implied by the cycle range in the title; with
    // four slots, one of them had to go.
    dayPace === null
      ? null
      : { label: 'Days on target', value: `${dayPace.noSpend + dayPace.under} of ${dayPace.days}` },
    // Days, not money, so it survives a cycle with no budget at all — the one forward figure that
    // does not need a ceiling to divide.
    forward === null ? null : { label: 'Days left', value: String(forward.daysLeft) },
    { label: 'Transactions', value: String(count) },
    { label: 'Categories', value: String(slices.length) },
  ];

  return {
    // The cycle label IS its date range ("18 Aug – 17 Sep 2026"), so there is no second line to put
    // under it. A first draft printed formatIsoRange as a subtitle and rendered the same string twice.
    title: label,
    generatedAt: formatStamp(now),
    headlineLabel: 'Spent this cycle',
    headline: formatBahtWhole(grossSpend),
    kpis: candidates.filter((k) => k !== null).slice(0, MAX_KPIS),
    rows,
  };
}
