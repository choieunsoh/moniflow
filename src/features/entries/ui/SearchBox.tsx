'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { filterSuggestions, wrapIndex } from '../combobox';

// Records search — one slim field, no chrome. A magnifier marks it; typing runs a live search
// (debounced) that re-renders the server component with fresh cross-cycle results, so there's no
// submit button. An inline ✕ clears it. The dropdown is a combobox over the in-memory suggestion
// pool (distinct categories + accounts), filtered by "contains" — the same rule the DB search uses,
// so it never offers a value the search wouldn't match. router.replace (not push) keeps the back
// button from filling with one entry per keystroke; only the ?q= param changes, so this client
// component keeps its state (value, focus, dropdown).
export function SearchBox({ query, suggestions }: { query: string; suggestions: string[] }) {
  const router = useRouter();
  const listId = useId();

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
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        go(value);
      }}
      className="relative"
    >
      <SearchIcon />
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
        placeholder="Search records"
        className="h-11 w-full rounded-[var(--radius-md)] border pr-11 pl-10 text-sm transition-colors duration-150 outline-none placeholder:text-[var(--color-muted)]"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            setOpen(false);
            go('');
          }}
          aria-label="Clear search"
          className="absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-[var(--radius-md)] text-base"
          style={{ color: 'var(--color-muted)' }}
        >
          ✕
        </button>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="menu absolute top-full left-0 z-[var(--z-dropdown)] mt-2 max-h-72 w-full overflow-auto py-1"
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
    </form>
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

// Magnifier marking the field. Absolutely placed inside the input's left padding; decorative, so
// it's aria-hidden and ignores pointer events (taps fall through to the input).
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      style={{ color: 'var(--color-muted)' }}
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
