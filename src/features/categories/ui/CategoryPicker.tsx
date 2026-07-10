'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CategoryIcon } from './CategoryIcon';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import type { IconSet } from '@features/settings/queries';

type Editing = { category: string; current: string; hue?: number };
type PickerApi = { open: (editing: Editing) => void };

const CategoryPickerContext = createContext<PickerApi | null>(null);

// A single shared icon/background picker for a whole page. One <dialog> is mounted (not one per row),
// and openers re-point it at whichever category was tapped. Wrap a list of CategoryIconButton in this
// provider. Used by /records, where a picker-per-row would mount dozens of dialogs.
export function CategoryPickerProvider({
  iconSet,
  children,
}: {
  iconSet: IconSet;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const open = useCallback((next: Editing) => {
    setEditing(next);
    ref.current?.showModal();
  }, []);

  return (
    <CategoryPickerContext.Provider value={{ open }}>
      {children}
      <CategoryPickerDialog
        category={editing?.category ?? null}
        current={editing?.current ?? ''}
        hue={editing?.hue}
        iconSet={iconSet}
        dialogRef={ref}
        onClose={() => setEditing(null)}
      />
    </CategoryPickerContext.Provider>
  );
}

function useCategoryPicker(): PickerApi {
  const api = useContext(CategoryPickerContext);
  if (!api) throw new Error('CategoryIconButton must be used within a CategoryPickerProvider');
  return api;
}

// A category marker that opens the shared picker for its category. Drop-in replacement for a static
// CategoryIcon inside a CategoryPickerProvider.
export function CategoryIconButton({
  category,
  emoji,
  iconSet,
  hue,
}: {
  category: string;
  emoji: string;
  iconSet: IconSet;
  hue?: number;
}) {
  const { open } = useCategoryPicker();

  return (
    <button
      type="button"
      onClick={() => open({ category, current: emoji, hue })}
      aria-label={`Choose icon for ${category}`}
      title={`Change icon for ${category}`}
      className="shrink-0 rounded-full transition-opacity active:opacity-70"
    >
      <CategoryIcon emoji={emoji} name={category} size="md" iconSet={iconSet} hue={hue} />
    </button>
  );
}
