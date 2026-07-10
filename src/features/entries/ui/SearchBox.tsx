'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { filterSuggestions, wrapIndex } from '../combobox';

// Search entry point for /records. A native <details> whose <summary> is the search icon reveals a
// custom combobox: the input filters an in-memory suggestion list (distinct categories + accounts)
// by "contains" — the same rule the DB search uses, so the dropdown never offers a value the search
// wouldn't match. Live search: typing navigates to ?q= 300ms after you stop (debounced), which
// re-renders the server component with fresh results; Enter / a suggestion / the Search button fire
// immediately. router.replace (not push) keeps the back button from filling with one entry per
// keystroke. Selecting only changes the ?q= param, so this client component keeps its state.
export function SearchBox({ query, suggestions }: { query: string; suggestions: string[] }) {
  const router = useRouter();
  const listId = useId();
  const active = query.length > 0;

  const [value, setValue] = useState(query);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const matches = filterSuggestions(suggestions, value);
  const showList = open && matches.length > 0;

  function go(next: string): void {
    const q = next.trim();
    router.replace(q ? `/records?q=${encodeURIComponent(q)}` : '/records');
  }

  // Live search: navigate 300ms after the last keystroke. Skips when the URL already shows this
  // query (initial mount, or right after an immediate navigation) so it never re-fetches for free.
  const debounced = useDebouncedValue(value, 300);
  useEffect(() => {
    const q = debounced.trim();
    if (q !== query) router.replace(q ? `/records?q=${encodeURIComponent(q)}` : '/records');
  }, [debounced, query, router]);

  function choose(s: string): void {
    setValue(s);
    setOpen(false);
    go(s); // immediate, don't wait for the debounce
  }

  function clear(): void {
    setValue('');
    setOpen(false);
    go('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!showList) setOpen(true);
      else setHighlight((h) => wrapIndex(h, matches.length, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter' && showList && highlight >= 0) {
      e.preventDefault();
      choose(matches[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <details open={active} className="panel px-2 py-1">
      <summary className="tap flex cursor-pointer list-none items-center gap-2 px-2 [&::-webkit-details-marker]:hidden">
        <SearchIcon />
        <span className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>
          {active ? `Search: ${query}` : 'Search records'}
        </span>
      </summary>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          go(value);
        }}
        className="mt-1 flex items-center gap-2 px-1 pb-1"
      >
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            role="combobox"
            aria-label="Search records"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
              setHighlight(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder="Description, category, or account…"
            className="w-full rounded-[var(--radius-md)] px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--color-surface-2)' }}
          />
          {showList && (
            <ul
              id={listId}
              role="listbox"
              className="panel absolute top-full left-0 z-20 mt-1 max-h-72 w-full overflow-auto py-1"
            >
              {matches.map((s, i) => (
                <li
                  key={s}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  // preventDefault keeps the input focused so onClick fires before onBlur closes us.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(s)}
                  className="flex min-h-11 cursor-pointer items-center px-3 text-sm"
                  style={i === highlight ? { background: 'var(--color-surface-2)' } : undefined}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          className="tap rounded-[var(--radius-md)] px-3 text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          Search
        </button>
        {active && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="tap grid place-items-center rounded-[var(--radius-md)] px-2 text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            ✕
          </button>
        )}
      </form>
    </details>
  );
}

// Standard debounce: mirror `value` into state `delay` ms after it last changed, cancelling the
// pending update on every keystroke and on unmount.
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
