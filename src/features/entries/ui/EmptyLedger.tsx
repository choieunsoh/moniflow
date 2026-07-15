import Link from 'next/link';

// Empty state teaches the interface instead of saying "no data". It used to print `npm run dev -- seed`,
// which stopped working when the browser became the system of record (the CLI's db was a throwaway
// in-memory one) and is gone entirely now — so it points at the two ways data actually gets in: key one
// expense on the keypad, or restore a whole history from a Monefy CSV. Both are reachable from here.
export function EmptyLedger() {
  return (
    <div className="panel flex flex-col items-center gap-5 px-6 py-16 text-center">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-[var(--radius-md)]"
        style={{ background: 'var(--color-accent-soft)' }}
      >
        <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M1.5 11.5 5 7l3 2.5L14.5 3.5M11 3.5h3.5V7"
            stroke="var(--color-accent-text)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-lg font-semibold">No entries yet</h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Tap{' '}
          <span className="font-medium" style={{ color: 'var(--color-accent-text)' }}>
            +
          </span>{' '}
          below to key in your first expense. Already tracking elsewhere? Restore a Monefy CSV
          export to bring your whole history in at once.
        </p>
      </div>
      <Link href="/settings" className="btn btn-ghost">
        Restore from a backup
      </Link>
    </div>
  );
}
