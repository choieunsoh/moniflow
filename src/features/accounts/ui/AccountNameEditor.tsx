'use client';

import { useState } from 'react';
import { mergeAccountAction } from '../actions';
// ponytail: willMerge is imported laterally from features/categories rather than graduated to
// shared — a deliberate call while accounts is only the 2nd consumer. Graduate merge-guard (and
// color) to @shared/ when a 3rd consumer appears.
import { willMerge } from '@features/categories/merge-guard';

// Tap the account name to rename inline — or type an existing name to merge this account into that one
// (#account-options autocompletes). Saves on blur or Enter; a blur that's unchanged or empty collapses
// without submitting. Typing an EXISTING name folds this account into it (irreversible), so both save
// paths confirm first. The confirm is deferred a tick (a synchronous confirm() inside a blur steals
// focus and loops forever on cancel). Mirrors CategoryNameEditor.
export function AccountNameEditor({ account, onDone }: { account: string; onDone?: () => void }) {
  const [editing, setEditing] = useState(false);

  function attemptSubmit(input: HTMLInputElement) {
    const next = input.value.trim();
    if (!next || next === account) {
      setEditing(false);
      return;
    }
    // ponytail: merge-confirm is inert until a page renders <datalist id="account-options"> (the
    // /accounts page does). Matches CategoryNameEditor's #category-options scoping.
    const existing = Array.from(
      document.querySelectorAll<HTMLOptionElement>('#account-options option'),
      (o) => o.value,
    );
    if (willMerge(next, account, existing)) {
      setTimeout(() => {
        if (window.confirm(`Merge “${account}” into “${next}”? This can’t be undone.`)) {
          input.form?.requestSubmit();
        } else {
          setEditing(false);
        }
      }, 0);
      return;
    }
    input.form?.requestSubmit();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`Rename ${account}`}
        className="min-h-11 min-w-0 flex-1 truncate text-left font-medium"
      >
        {account}
      </button>
    );
  }

  return (
    <form
      action={mergeAccountAction}
      onSubmit={() => onDone?.()}
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      <input type="hidden" name="from" value={account} />
      <input
        name="to"
        list="account-options"
        defaultValue={account}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => attemptSubmit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            attemptSubmit(e.currentTarget);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            e.currentTarget.value = account;
            setEditing(false);
          }
        }}
        required
        aria-label={`Rename ${account}`}
        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 text-base"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
      />
    </form>
  );
}
