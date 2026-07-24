// Analytics' loading state — traces the primary trend panel (header + h-56 chart + breakdown rows)
// and the supporting heatmap / notes pair below it, so the page holds its shape through the OPFS read
// instead of reflowing from a lone "…". Same approach as HomeSkeleton: pulse on the wrapper,
// reduced-motion handled globally, draw the fullest common form since the read hasn't landed yet.
function Bar({ className }: { className: string }) {
  return (
    <span
      className={`block rounded-[var(--radius-sm)] ${className}`}
      style={{ background: 'var(--color-surface-2)' }}
    />
  );
}

export function AnalyticsSkeleton() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6"
      aria-busy="true"
      aria-label="Loading analytics"
    >
      <div className="panel flex flex-col gap-5 p-5">
        {/* Header: title + subtitle on the left, the window total on the right. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex flex-col gap-1">
            <Bar className="h-6 w-28" />
            <Bar className="h-3 w-40" />
          </span>
          <Bar className="h-6 w-24" />
        </div>
        {/* TrendChart's own wrapper is h-56 w-full — trace it exactly so the chart lands in the box
            that was reserved for it. */}
        <Bar className="h-56 w-full" />
        {/* Breakdown rows: disc + name + amount. Eight fills the viewport; the unfiltered list is
            uncapped, so a longer month grows the panel below the fold rather than jumping the chart
            above it. */}
        <ul className="flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <Bar className="size-11 shrink-0 rounded-full" />
              <Bar className="h-4 flex-1" />
              <Bar className="h-4 w-16" />
            </li>
          ))}
        </ul>
      </div>
      {/* The supporting pair, grouped at gap-3 to match the live layout. */}
      <div className="flex flex-col gap-3">
        {/* Heatmap: a 7-column month grid under its heading — one label row + five weeks of cells. */}
        <div className="panel flex flex-col gap-3 p-5">
          <Bar className="h-4 w-28" />
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <Bar key={`l${i}`} className="mx-auto h-3 w-3" />
            ))}
            {Array.from({ length: 35 }, (_, i) => (
              <Bar key={`c${i}`} className="aspect-square w-full" />
            ))}
          </div>
        </div>
        {/* Top notes: heading + a few ranked rows. */}
        <div className="panel flex flex-col gap-3 p-5">
          <Bar className="h-4 w-24" />
          <ul className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3">
                <Bar className="h-4 flex-1" />
                <Bar className="h-4 w-16" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
