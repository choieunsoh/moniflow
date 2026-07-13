// The mark: a rounded accent tile carrying an 'm' monogram whose last stroke flows off into a
// money-line + arrow — the same mark as the app icon (src/app/icon.svg), kept in sync by hand.
// Uses the accent tokens so a reskin (swap --color-accent) recolors it for free.
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-[var(--radius-sm)]"
        style={{ background: 'var(--color-accent)' }}
      >
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
          <g
            stroke="var(--color-on-accent)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7.5 22 V15 A3 3 0 0 1 13.5 15 V22 M13.5 15 A3 3 0 0 1 19.5 15 V18.5" />
            <path d="M19.5 18.5 C20 21.5 22.8 22.4 25.2 20.4 L28 18" />
            <path d="M25.6 16.7 L28.2 17.8 L27 20.4" />
          </g>
        </svg>
      </span>
      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]">moniflow</span>
    </span>
  );
}
