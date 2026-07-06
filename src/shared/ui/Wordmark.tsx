// The mark: a rounded accent tile carrying a rising flow line — money moving, stated calmly.
// Uses currentColor / the accent token so a reskin (swap --color-accent) recolors it for free.
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-[var(--radius-sm)]"
        style={{ background: 'var(--color-accent)' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M1.5 11.5 5 7l3 2.5L14.5 3.5"
            stroke="var(--color-on-accent)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11 3.5h3.5V7"
            stroke="var(--color-on-accent)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]">moniflow</span>
    </span>
  );
}
