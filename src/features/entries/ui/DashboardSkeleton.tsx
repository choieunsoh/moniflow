// Dashboard's loading state — traces the four-card stack (DashboardCards) so the page settles into
// its shape instead of reflowing from a lone "…". Same approach as HomeSkeleton: the pulse lives on
// the wrapper, and each card draws its fullest form (figure + sub-line) unconditionally, since the
// OPFS read hasn't yet resolved which of the null / over-budget / normal variants will render. The
// pulse needs no reduced-motion branch — globals.css neutralizes every animation under
// prefers-reduced-motion, leaving the shapes static.
function Bar({ className }: { className: string }) {
  return (
    <span
      className={`block rounded-[var(--radius-sm)] ${className}`}
      style={{ background: 'var(--color-surface-2)' }}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className="flex animate-pulse flex-col gap-4"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      {/* Safe to spend — the hero card. Its figure is text-4xl (a 36px line), so h-9, matching the
          weight the real card now leads with. */}
      <div className="panel flex flex-col gap-2 p-5">
        <Bar className="h-4 w-28" />
        <Bar className="h-9 w-40" />
        <Bar className="h-4 w-24" />
        <Bar className="h-4 w-40" />
      </div>
      {/* Projected + this-vs-last — supporting cards, text-2xl (a 32px line) figures, so h-8. */}
      <div className="panel flex flex-col gap-2 p-5">
        <Bar className="h-4 w-32" />
        <Bar className="h-8 w-36" />
        <Bar className="h-4 w-44" />
      </div>
      <div className="panel flex flex-col gap-2 p-5">
        <Bar className="h-4 w-28" />
        <Bar className="h-8 w-32" />
        <Bar className="h-4 w-40" />
      </div>
      {/* Recent activity — five 44px rows (disc + two text lines + amount). Five is the card's cap,
          reserved in full so a lighter cycle settles UP, not down (the HomeSkeleton argument). */}
      <div className="panel flex flex-col gap-2 p-5">
        <Bar className="h-4 w-28" />
        <ul className="flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex min-h-11 items-center gap-3">
              <Bar className="size-11 shrink-0 rounded-full" />
              <span className="flex flex-1 flex-col gap-1">
                <Bar className="h-4 w-24" />
                <Bar className="h-3 w-16" />
              </span>
              <Bar className="h-4 w-14" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
