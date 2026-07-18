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
      <div className="panel flex flex-col items-center gap-6 p-5">
        {/* The donut: a ring, so the shape that arrives is the shape that was promised. */}
        <span
          className="mt-2 size-40 rounded-full"
          style={{
            background: 'var(--color-surface-2)',
            maskImage: 'radial-gradient(circle, transparent 60%, black 61%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 60%, black 61%)',
          }}
        />
        <ul className="flex w-full flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
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
