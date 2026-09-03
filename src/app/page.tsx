'use client';

import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { ViewToggle } from '@shared/ui/ViewToggle';
import { useHome } from '@features/entries/use-home';
import { pacePhrase } from '@features/budgets/budget-status';
import { BudgetMeter } from '@features/budgets/ui/BudgetMeter';
import { formatBahtWhole } from '@shared/money';
import { DonutChart } from '@features/entries/ui/DonutChart';
import { drawnTotal } from '@features/entries/donut';
import { SafeToSpendCard, TodayAllowanceCard } from '@features/entries/ui/ForwardCards';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { stepKey } from '@features/entries/cycle';
import { CycleProgress } from '@features/entries/ui/CycleProgress';
import { SwipeNav } from '@features/entries/ui/SwipeNav';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { HomeSkeleton } from '@features/entries/ui/HomeSkeleton';
import { LegendRow } from '@features/entries/ui/LegendRow';
import { TopTransactionsList } from '@features/entries/ui/TopTransactionsList';
import { RingFootnote } from '@features/entries/ui/RingFootnote';

// Home = the expense overview for the current cycle. Chart view: a spending donut with a colour-keyed
// legend; List view: the same categories as ranked bars. A ?view= toggle switches them.
//
// The headline figures — total spent and the budget meter — sit ABOVE the toggle deliberately. They
// used to live inside the chart branch, which made the toggle a feature switch rather than a view
// switch: anyone who preferred the ranked list lost the cycle total entirely and had to carry it in
// their head. The toggle now swaps only the visualisation; the answer stays put.
//
// Expense-only — no net/inflow figures. Cycle data loads client-side via useHome against the browser
// OPFS db (params come from useSearchParams, not a server searchParams prop).
export default function HomePage() {
  const params = useSearchParams();
  const cycleParam = params.get('cycle');
  const view = params.get('view') ?? undefined;
  const { ready, data } = useHome(cycleParam);

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <HomeSkeleton />
      </PageContainer>
    );
  }

  const {
    cutoff,
    activeKey,
    canGoNext,
    isCurrentCycle,
    summary,
    categoryBreakdown,
    slices,
    sliceColors,
    total,
    offBudgetTotal,
    fixedPosted,
    emojiMap,
    hueMap,
    iconSet,
    limits,
    totalStatus,
    progress,
    pacePct,
    showPace,
    forward,
    ledgerEmpty,
    topTransactions,
  } = data;

  // Where the swipe lands: the neighbouring cycle, with every other param (?view=) carried across —
  // changing cycle must not silently drop the view you chose. Forward is closed on today's cycle,
  // matching CycleSelector's disabled arrow.
  const swipeHref = (delta: -1 | 1) => {
    const next = new URLSearchParams(params.toString());
    next.set('cycle', stepKey(activeKey, delta));
    return `/?${next.toString()}`;
  };

  const showList = view === 'category';
  const hasSpending = summary.count > 0;
  // The headline figure and the meter must agree on what "spent" means — discretionary spend
  // (off-budget entries dropped), not the all-in cycle total the donut shows below. totalStatus is
  // built from the same discretionary figure, so reading its `spent` keeps the two in lockstep; with
  // no budget set there's no totalStatus to read, so fall back to the all-in total minus BOTH
  // exclusions — dropping only off-budget there would leave the no-budget headline counting fixed
  // bills the budgeted headline does not.
  const discretionarySpend = totalStatus ? totalStatus.spent : total - offBudgetTotal - fixedPosted;
  // The categories the ring folded into Other, carried on the bucket itself (only the fold knows
  // which they were). Empty whenever the cycle fits inside the palette and there is no Other at all.
  const folded = slices.find((s) => s.other)?.folded ?? [];
  // The ring's own sum. Shares divide by this, never by `total`: `total` is the signed net and
  // still carries refunds, while every drawn slice is a positive magnitude, so the two disagree
  // by exactly the refunded amount and the shares overshoot 100%.
  const grossSpend = drawnTotal(slices);
  // The ring drew gross magnitudes; `total` is the signed net. The gap between them IS the refund,
  // and these are the categories it came from (a stored amount is negative for an expense, so a
  // category netting positive is one that handed money back).
  const refunded = grossSpend - total;
  const refundedCategories = categoryBreakdown.filter((r) => r.total > 0).map((r) => r.key);

  // The current cycle's forward cards (safe-to-spend + projection). Defined once and rendered in BOTH
  // the populated branch (below the headline) and the empty-current-cycle branch (above "Nothing spent"),
  // so a fresh zero-spend cycle still shows the allowance. `forward` is non-null only for the current
  // cycle (useHome gates it on isCurrentCycle), so a past cycle and first-run onboarding never render it.
  const forwardCards =
    forward !== null ? (
      <div className="-mt-3 flex flex-col gap-4">
        {/* Today's answer first, the cycle's answer under it — what's left today is what you check
            before buying lunch; safe-to-spend is what you check when planning the rest of the
            cycle. Renders nothing until a total budget exists, leaving the card below to make the
            single "set a budget" case. */}
        <TodayAllowanceCard allowance={forward.todayAllowance} spentToday={forward.spentToday} />
        <SafeToSpendCard
          safePerDay={forward.safePerDay}
          avgPerDay={forward.avgPerDay}
          daysLeft={forward.daysLeft}
          upcoming={forward.upcoming}
        />
      </div>
    ) : null;

  return (
    <PageContainer size="full">
      {/* The page's heading root. Visually redundant with the wordmark + cycle selector, so sr-only —
          but Home, Records and Analytics are the three routes with no visible page title, and without
          this a screen reader's heading list starts at the section <h2>s with no <h1> above them. */}
      <h1 className="sr-only">Home</h1>
      {/* The chrome above the data — cycle nav, its progress, the headline figure, the view toggle —
          is pulled to a 12px rhythm against PageContainer's 24px, so it reads as ONE band of controls
          and the 24px gaps that survive fall where the band ends and the visualisation begins.
          Uniform 24px throughout spent ~256px before the ring started and gave the eye no grouping.
          Done with -mt-3 rather than a wrapper div on purpose: CycleSelector is `sticky`, and a
          wrapper would become its containing block, so it would stop sticking the moment the wrapper
          scrolled past instead of holding under the header. */}
      <CycleSelector activeKey={activeKey} cutoff={cutoff} canGoNext={canGoNext} view={view} />
      {isCurrentCycle ? <CycleProgress progress={progress} className="-mt-3" /> : null}

      {hasSpending ? (
        <>
          {/* The cycle's answer, constant across both views. */}
          <section className="panel -mt-3 flex flex-col gap-1.5 p-5">
            {/* flex-wrap, not a fixed row: at 200% zoom / Extra Large text the label and the figure
                otherwise collide. Wrapping lets the figure drop to its own line instead. */}
            {/* The label stays "Spent this cycle" whether or not a budget exists. It used to flip to
                "Total budget" the moment one was set, which named the DENOMINATOR while the figure
                led with the numerator — "Total budget ฿63,295 / ฿30,000" reads as a ฿63k budget at a
                glance. The limit is context for the spend, so it trails it in muted text. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
                Spent this cycle
              </h2>
              <span className="tnum text-xl font-semibold">
                {formatBahtWhole(discretionarySpend)}
                {totalStatus ? (
                  <span className="text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
                    {' '}
                    of {formatBahtWhole(totalStatus.limit ?? 0)}
                  </span>
                ) : null}
              </span>
            </div>
            {offBudgetTotal > 0 ? (
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                + {formatBahtWhole(offBudgetTotal)} off-budget
              </span>
            ) : null}
            {/* Fixed cost gets its OWN line rather than joining the off-budget one, because the two
                did different things to the figure above: off-budget spend was set aside and left the
                budget alone, while this was subtracted FROM the budget — it is the whole reason the
                "of ฿48,280" reads lower than the limit on /budgets. Naming it here is also the only
                place this money surfaces on a budget surface, since /budgets drops these rows from
                its per-category meters. */}
            {fixedPosted > 0 ? (
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                + {formatBahtWhole(fixedPosted)} fixed — deducted from the budget
              </span>
            ) : null}
            {totalStatus ? <BudgetMeter status={totalStatus} pacePct={pacePct} /> : null}
            {/* The pace tick on the meter shows from day 1 — it's geometry. This phrase is a verdict,
                and on day 1 any spend at all reads as "over pace", so useHome holds it back until
                enough of the cycle has elapsed to mean something. */}
            {totalStatus && showPace && pacePct !== undefined && totalStatus.state !== 'over' ? (
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {pacePhrase(totalStatus.pct, pacePct)}
              </span>
            ) : null}
          </section>

          {forwardCards}

          <ViewToggle
            className="-mt-3"
            options={[
              { label: 'Chart', active: !showList, href: `/?cycle=${activeKey}&view=chart` },
              { label: 'List', active: showList, href: `/?cycle=${activeKey}&view=category` },
            ]}
          />

          <SwipeNav prevHref={swipeHref(-1)} nextHref={canGoNext ? swipeHref(1) : null}>
            {showList ? (
              <Breakdown
                title="Spending by category"
                rows={categoryBreakdown}
                emojis={emojiMap}
                hues={hueMap}
                iconSet={iconSet}
                limits={limits}
                pacePct={pacePct}
                cycleKey={activeKey}
                // The donut's slice colours, so a category reads the same in both views.
                colors={sliceColors}
              />
            ) : (
              <section className="panel flex flex-col gap-5 p-5">
                {/* The same heading Breakdown carries in List, for the same section of data. Without
                    it the DEFAULT view's main content was the only unheaded thing on the page, and
                    the heading outline changed depending on a ?view= param — a screen-reader user
                    got "Spent this cycle" and then an unlabelled region in Chart, but a named
                    "Spending by category" in List. The toggle swaps the visualisation; it should not
                    swap the document structure. */}
                <h2 className="text-base font-semibold">Spending by category</h2>
                <DonutChart rows={categoryBreakdown} />
                <ul className="flex flex-col gap-2.5">
                  {slices.map((s) => (
                    <LegendRow
                      key={s.name}
                      slice={s}
                      total={grossSpend}
                      cycleKey={activeKey}
                      emojis={emojiMap}
                      hues={hueMap}
                      iconSet={iconSet}
                    />
                  ))}
                </ul>
                <RingFootnote refunded={refunded} categories={refundedCategories} />
                {/* Other's way in. The ring has to fold its tail — fifteen slivers is not a chart —
                    but the fold was a dead end: on a long-tailed cycle that bucket runs to a sixth
                    of the spend and a dozen-plus transactions, inert by design, while List opened
                    the SAME tail behind a disclosure. So the toggle still changed the answer, one
                    level below the count fix in 12347ec: both views folded at MAX_SLICES, only one
                    let you past it. Same native <details> as Breakdown — same element, same copy
                    shape, keyboard and AT semantics for free. */}
                {folded.length > 0 ? (
                  <details>
                    <summary
                      className="tap flex cursor-pointer items-center text-sm"
                      style={{ color: 'var(--color-accent-text)' }}
                    >
                      {folded.length} {folded.length === 1 ? 'category' : 'categories'} in Other
                    </summary>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {folded.map((s) => (
                        <LegendRow
                          key={s.name}
                          slice={s}
                          total={grossSpend}
                          cycleKey={activeKey}
                          emojis={emojiMap}
                          hues={hueMap}
                          iconSet={iconSet}
                        />
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            )}
          </SwipeNav>

          <TopTransactionsList
            entries={topTransactions}
            emojiMap={emojiMap}
            hueMap={hueMap}
            iconSet={iconSet}
            cycleKey={activeKey}
          />
        </>
      ) : (
        <SwipeNav prevHref={swipeHref(-1)} nextHref={canGoNext ? swipeHref(1) : null}>
          {/* Two different emptinesses, and conflating them was a real bug: this branch used to
              fire on `summary.count === 0` alone, so paging back to a quiet month told someone with
              a full ledger "No entries yet" and offered a replace-everything CSV restore as the
              remedy. First-run onboarding is for an empty LEDGER; an empty CYCLE just says so and
              leaves the cycle nav to carry them somewhere with data. */}
          {ledgerEmpty ? (
            <EmptyLedger />
          ) : (
            <>
              {forwardCards}
              <section className="panel px-6 py-16 text-center">
                <h2 className="text-base font-semibold">Nothing spent in this cycle</h2>
                <p className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
                  Use the arrows above to look at another cycle.
                </p>
              </section>
            </>
          )}
        </SwipeNav>
      )}
    </PageContainer>
  );
}
