// Empty state teaches the interface instead of saying "no data". A fresh scaffold has an empty
// SQLite file, so this is the first thing most people see — it points them at the seed command
// (instant demo data) and the shape of a real entry.
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
          Moniflow reads a local SQLite file. Load a few sample inflows and outflows to see the
          dashboard come alive, then replace them with your own.
        </p>
      </div>
      <pre
        className="tnum overflow-x-auto rounded-[var(--radius-md)] px-4 py-3 text-left text-sm"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
      >
        <span style={{ color: 'var(--color-faint)' }}># load demo data, then reload</span>
        {'\n'}npm run dev -- seed
      </pre>
    </div>
  );
}
