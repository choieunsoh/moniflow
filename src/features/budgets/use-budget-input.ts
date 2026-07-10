import { useCallback, useRef } from 'react';

// Structural event shapes — the hook only touches these fields, so typing them narrowly keeps the
// handlers trivially testable (no need to fabricate a whole React SyntheticEvent) while staying
// assignable to <input onBlur/onKeyDown> (a real event is a supertype of each).
type BlurLike = { currentTarget: { value: string } };
type EnterLike = { key: string; preventDefault: () => void; currentTarget: { blur: () => void } };

// Auto-save-on-blur for a budget amount input. Uncontrolled: it reads the field on blur and commits
// via `onSave` only when the parsed amount is valid AND actually changed from the last committed
// value — so tabbing past an unedited field never fires a redundant write. Enter blurs the field,
// which commits. A blank field is a no-op (removal is a separate action, the "×" button).
export function useBudgetInput(saved: number | undefined, onSave: (amount: number) => void) {
  const committed = useRef(saved);

  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === '') return;
      const amount = Number(trimmed);
      if (!Number.isFinite(amount) || amount < 0) return;
      if (amount === committed.current) return;
      committed.current = amount;
      onSave(amount);
    },
    [onSave],
  );

  const onBlur = useCallback((e: BlurLike) => commit(e.currentTarget.value), [commit]);

  const onKeyDown = useCallback((e: EnterLike) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur(); // fires onBlur → commit
    }
  }, []);

  return { onBlur, onKeyDown };
}
