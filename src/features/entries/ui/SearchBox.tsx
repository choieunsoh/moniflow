import Link from 'next/link';

// Search entry point for /records. Zero client JS: a native <details> whose <summary> is the search
// icon, revealing a GET <form> that submits `?q=` and re-renders the server component (same pattern
// as the cycle/category/account params). Autocomplete comes free from <datalist> fed by the distinct
// categories + accounts. Opens automatically when a query is active so the box stays visible with
// what you searched; the ✕ link clears the query by navigating back to a bare /records.
export function SearchBox({ query, suggestions }: { query: string; suggestions: string[] }) {
  const active = query.length > 0;
  return (
    <details open={active} className="panel px-2 py-1">
      <summary className="tap flex cursor-pointer list-none items-center gap-2 px-2 [&::-webkit-details-marker]:hidden">
        <SearchIcon />
        <span className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>
          {active ? `Search: ${query}` : 'Search records'}
        </span>
      </summary>

      <form action="/records" method="get" className="mt-1 flex items-center gap-2 px-1 pb-1">
        <input
          type="search"
          name="q"
          defaultValue={query}
          list="records-search-suggestions"
          autoComplete="off"
          placeholder="Description, category, or account…"
          aria-label="Search records"
          className="min-w-0 flex-1 rounded-[var(--radius-md)] px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--color-surface-2)' }}
        />
        <button
          type="submit"
          className="tap rounded-[var(--radius-md)] px-3 text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          Search
        </button>
        {active && (
          <Link
            href="/records"
            aria-label="Clear search"
            className="tap grid place-items-center rounded-[var(--radius-md)] px-2 text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            ✕
          </Link>
        )}
        <datalist id="records-search-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </form>
    </details>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
