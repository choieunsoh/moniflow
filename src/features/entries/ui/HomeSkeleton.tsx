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
      <div className="panel flex items-center justify-between p-4">
        <Bar className="h-4 w-5" />
        <Bar className="h-4 w-32" />
        <Bar className="h-4 w-5" />
      </div>
      {/* The three blocks below were missing, and the omission was drift rather than a decision: the
          skeleton was drawn when the total panel still lived inside the chart branch, and stayed put
          when the total moved above the toggle. The result was an 859px placeholder settling into a
          1189px page — a 330px jump that shoved the donut down under the reader's eye just as it
          arrived. Traced here at their real heights so the page settles in place.
          They are drawn unconditionally even though the live page hides the progress bar on a past
          cycle and the budget meter without a budget: the skeleton cannot know either answer before
          the read completes, and guessing short reopens the jump it exists to close. */}
      <div className="flex items-center gap-2 px-1">
        <Bar className="h-1.5 flex-1" />
        <Bar className="h-3 w-20" />
      </div>
      <div className="panel flex flex-col gap-1.5 p-5">
        <div className="flex items-baseline justify-between">
          <Bar className="h-4 w-28" />
          <Bar className="h-6 w-32" />
        </div>
        <Bar className="h-2 w-full" />
      </div>
      <div className="panel flex gap-1 p-1">
        <Bar className="h-11 flex-1" />
        <Bar className="h-11 flex-1" />
      </div>
      <div className="panel flex flex-col items-center gap-6 p-5">
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
        {/* gap-2.5 and 44px rows match LegendRow. Six is a deliberate middle estimate, not a known
            answer: the legend runs from one row to the donut's cap of eight (seven slices + Other),
            and the skeleton cannot know which before the read returns. Six lands exact on a typical
            cycle and errs slightly tall on a busy one — content settling UP is kinder than content
            being shoved DOWN under a reader whose eye is already at the top of the list. */}
        <ul className="flex w-full flex-col gap-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <Bar className="size-11 shrink-0 rounded-full" />
              <Bar className="h-4 flex-1" />
              <Bar className="h-4 w-14" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
