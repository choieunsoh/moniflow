'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { filterSuggestions, wrapIndex } from '../combobox';

// Records search — one slim field, no chrome. A magnifier marks it; typing runs a live search
// (debounced) that re-renders the server component with fresh cross-cycle results, so there's no
// submit button. An inline ✕ clears it. The dropdown is a combobox over the in-memory suggestion
// pool (distinct categories + accounts), filtered by "contains" — the same rule the DB search uses,
// so it never offers a value the search wouldn't match. router.replace (not push) keeps the back
// button from filling with one entry per keystroke; only the ?q= param changes, so this client
// component keeps its state (value, focus, dropdown).
export function SearchBox({ suggestions }: { suggestions: string[] }) {
  const router = useRouter();
  const listId = useId();
  // The header lives in the layout and gets no page searchParams, so read the active query straight
  // off the URL. Typing from any page redirects to /records?q=… — that's the "results show on
  // records" behaviour.
  const query = (useSearchParams().get('q') ?? '').trim();

  const [value, setValue] = useState(query);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // Resting state is just the magnifier icon; tapping it reveals the field. Derived, not stored:
  // the field also shows whenever a query is active (deep link / mid-search), so no effect is
  // needed to sync the two.
  const [expanded, setExpanded] = useState(false);
  const showField = expanded || query.length > 0;
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Focus the field the moment it appears so the user can type straight away.
  useEffect(() => {
    if (showField) inputRef.current?.focus();
  }, [showField]);

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

  // Collapsed: only the magnifier, aligned right (the header slot is flex-1). Tap → expand + focus.
  if (!showField) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Search records"
          aria-expanded={false}
          className="tap grid size-11 place-items-center rounded-[var(--radius-md)] text-[var(--color-muted)] transition-colors duration-150 hover:text-[var(--color-text)]"
        >
          <MagnifierGlyph size={18} />
        </button>
      </div>
    );
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
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        style={{ color: 'var(--color-muted)' }}
      >
        <MagnifierGlyph size={18} />
      </span>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Search records"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
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
        // Collapse back to the icon when the user taps away with nothing typed.
        onBlur={() => {
          setOpen(false);
          if (value.trim() === '') setExpanded(false);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search records"
        className="h-11 w-full rounded-[var(--radius-md)] border pr-11 pl-10 text-sm transition-colors duration-150 outline-none placeholder:text-[var(--color-muted)]"
        style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
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
          className="absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-[var(--radius-md)] text-[var(--color-muted)] transition-colors duration-150 hover:text-[var(--color-text)]"
        >
          <ClearIcon />
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
              className="flex min-h-11 cursor-pointer items-center px-3 text-sm transition-colors duration-150"
              style={i === highlight ? { background: 'var(--color-accent-soft)' } : undefined}
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

// Clear (✕) glyph as an SVG matching the magnifier's 1.75 stroke, so the field's two icons read as
// one family rather than a stroked icon beside a unicode character.
function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

// Magnifier glyph (1.75 stroke, matching the clear ✕). Rendered two ways: the collapsed icon
// button, and — wrapped in a positioned span — decoratively inside the expanded field's padding.
function MagnifierGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
