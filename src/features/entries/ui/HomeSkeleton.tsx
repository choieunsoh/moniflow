// Home's loading state. Reads from OPFS after mount, so the first paint is always a placeholder —
// which used to be a lone "…" in the middle of an empty column. This traces the real layout instead
// (cycle bar, donut, legend rows), so the page settles into its shape rather than reflowing from
// nothing, and the wait reads as "loading" rather than "broken".
//
// The pulse needs no reduced-motion branch of its own: globals.css neutralizes every animation under
// `prefers-reduced-motion: reduce`, leaving the shapes static.
function Bar({ className }: { className: string }) {
  return (
    <span
      className={`block rounded-[var(--radius-sm)] ${className}`}
      style={{ background: 'var(--color-surface-2)' }}
    />
  );
}

export function HomeSkeleton() {
  return (
    // aria-busy + a polite label: a screen reader announces the wait once instead of reading out a
    // tree of empty boxes.
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading cycle">
      {/* p-2 around 44px controls, not p-4 around a 16px bar: CycleSelector's chevrons are size-11
          tap targets, so the real bar stands 61px and a p-4 trace stood 49px. The arrows reserve the
          full 44px box but only ink a chevron-sized mark inside it — tracing the tap target as solid
          ink would promise two heavy blocks and deliver two small glyphs. */}
      <div className="panel flex items-center justify-between p-2">
        <span className="grid size-11 place-items-center">
          <Bar className="size-5" />
        </span>
        <Bar className="h-4 w-32" />
        <span className="grid size-11 place-items-center">
          <Bar className="size-5" />
        </span>
      </div>
      {/* The three blocks below — progress, total, toggle — are the live page's cycle chrome, and
          they carry its -mt-3 band (see page.tsx), not the container's uniform gap-6. They were
          left at gap-6 when 5b2a673 introduced the band, so the placeholder reserved 36px the page
          then gave back; the band also has to LOOK like a band while loading, or the grouping only
          appears once the read lands.
          They are drawn unconditionally even though the live page hides the progress bar on a past
          cycle and the budget meter without a budget: the skeleton cannot know either answer before
          the read completes, and guessing short reopens the jump it exists to close. */}
      <div className="-mt-3 flex items-center gap-2 px-1">
        <Bar className="h-1.5 flex-1" />
        <Bar className="h-4 w-20" />
      </div>
      <div className="panel -mt-3 flex flex-col gap-1.5 p-5">
        <div className="flex items-baseline justify-between">
          <Bar className="h-4 w-28" />
          {/* h-7: the figure is text-xl semibold, a 28px line — h-6 traced it 4px short. */}
          <Bar className="h-7 w-32" />
        </div>
        {/* BudgetMeter is a ROW — an h-2 track beside a text-xs caption — so it stands 16px, not the
            8px a lone bar reserved. */}
        <div className="flex items-center gap-2">
          <Bar className="h-2 flex-1" />
          <Bar className="h-4 w-16" />
        </div>
        {/* The pace verdict under the meter, drawn unconditionally for the same reason the meter
            above it is: the skeleton cannot know whether a budget exists or whether enough of the
            cycle has elapsed for the phrase to show, and guessing short reopens the jump. */}
        <Bar className="h-4 w-44" />
      </div>
      <div className="panel -mt-3 flex gap-1 p-1">
        <Bar className="h-11 flex-1" />
        <Bar className="h-11 flex-1" />
      </div>
      {/* gap-5, matching the live donut section — it had drifted to gap-6. */}
      <div className="panel flex flex-col items-center gap-5 p-5">
        {/* The "Spending by category" heading both views carry — text-base semibold, a 24px line. */}
        <Bar className="h-6 w-44 self-start" />
        {/* The donut: a ring, so the shape that arrives is the shape that was promised. The h-64 box
            is not decorative — it mirrors DonutChart's own fixed `h-64` wrapper exactly, so the
            chart lands at the height reserved for it. Drawn as a 160px ring centred in that box
            rather than filling it, because echarts insets the ring the same way. */}
        <span className="grid h-64 w-full place-items-center">
          <span
            className="size-40 rounded-full"
            style={{
              background: 'var(--color-surface-2)',
              maskImage: 'radial-gradient(circle, transparent 60%, black 61%)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 60%, black 61%)',
            }}
          />
        </span>
        {/* gap-2.5 and 44px rows match LegendRow. Eight is the donut's CAP (seven slices + Other),
            not a middle estimate — the previous six claimed to err tall on a busy cycle and measured
            the opposite: a 13-category month settled 138px LOWER than its placeholder, shoving the
            donut down under a reader whose eye had already arrived. The skeleton cannot know the
            count before the read returns, so it reserves the most the ring can ever draw: a quiet
            cycle then settles UP, which is the direction this file already argued for.
            Measure like for like when checking this: the placeholder is a CHILD of PageContainer,
            so compare `main > :first-child` in both states — comparing this div against the
            container's own box silently adds its 12px/24px padding to the result. */}
        <ul className="flex w-full flex-col gap-2.5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <Bar className="size-11 shrink-0 rounded-full" />
              <Bar className="h-4 flex-1" />
              <Bar className="h-4 w-14" />
            </li>
          ))}
        </ul>
        {/* The "N categories in Other" disclosure. It ships whenever the ring folds a tail — the
            same condition that puts the eighth row above — so a placeholder that draws the cap but
            not the summary is short by its 44px tap target every time the cap is reached. */}
        <Bar className="h-11 w-40 self-start" />
      </div>
    </div>
  );
}
