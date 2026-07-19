'use client';

// Shown when the ledger cannot be opened at all. In practice that means one thing — OPFS grants its
// exclusive handle to a single tab, so moniflow is already open somewhere else — but the copy names
// the likely cause without swearing it is the only one, because a wrong diagnosis stated confidently
// is worse than an honest "couldn't open it".
//
// A panel rather than a toast: a toast is for something that happened and passed, and this is a
// standing condition the page cannot render around. It replaces the page content instead of sitting
// above it, since every figure underneath would be missing or stale anyway.
export function DbUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="panel flex flex-col items-center gap-5 px-6 py-16 text-center" role="alert">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-[var(--radius-md)]"
        style={{ background: 'var(--color-accent-soft)' }}
      >
        <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M4 6.5V4.75A2.75 2.75 0 0 1 6.75 2h2.5A2.75 2.75 0 0 1 12 4.75V6.5"
            stroke="var(--color-accent-text)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <rect
            x="3"
            y="6.5"
            width="10"
            height="7.5"
            rx="1.5"
            stroke="var(--color-accent-text)"
            strokeWidth="1.5"
          />
        </svg>
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-lg font-semibold">Can&rsquo;t open your ledger</h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Moniflow can only be open in one tab at a time. If it&rsquo;s open in another tab, close
          that one and try again — your data is safe on this device either way.
        </p>
      </div>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
