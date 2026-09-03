'use client';

import { useCategoriesPage } from '@features/categories/use-categories-page';
import { emojiFor, hueFor } from '@features/categories/queries';
import { EmojiPicker } from '@features/categories/ui/EmojiPicker';
import { OffBudgetToggle } from '@features/categories/ui/OffBudgetToggle';
import { CategoryNameEditor } from '@features/categories/ui/CategoryNameEditor';
import { AddCategory } from '@features/categories/ui/AddCategory';
import { DeleteCategoryButton } from '@features/categories/ui/DeleteCategoryButton';
import { CategoryReorderButton } from '@features/categories/ui/CategoryReorderButton';
import { PageContainer } from '@shared/ui/PageContainer';
import Link from 'next/link';

const countFmt = new Intl.NumberFormat('en-US');

// Categories list — every category, its usage count, and its emoji/hue. Loads client-side via
// useCategoriesPage against the browser OPFS db; add/rename/delete/reorder actions bump the
// data-version, which refetches this list.
export default function CategoriesPage() {
  const { ready, data } = useCategoriesPage();

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  const { counts, emojiMap, hueMap, offBudgetSet, iconSet, keypadCategories } = data;

  return (
    <PageContainer size="full">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Add a category below, or tap one&apos;s icon to restyle it and its name to rename (type
            an existing name to merge). An unused category (0) can be deleted.
          </p>
        </div>
        {/* Seeded from the keypad's own list so the sheet shows (and edits) the manual keypad order,
            not the usage-desc order of the list below. */}
        {counts.length > 1 && <CategoryReorderButton items={keypadCategories} iconSet={iconSet} />}
      </header>

      <section className="panel overflow-hidden">
        {counts.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--color-muted)' }}>
            No categories yet — add one below, or import some entries.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {counts.map((c) => (
              <li key={c.category} className="flex items-center gap-3 px-4 py-3">
                <EmojiPicker
                  category={c.category}
                  current={emojiFor(emojiMap, c.category)}
                  iconSet={iconSet}
                  currentHue={hueFor(hueMap, c.category)}
                />
                <CategoryNameEditor category={c.category} />
                <OffBudgetToggle category={c.category} checked={offBudgetSet.has(c.category)} />
                {c.count === 0 ? (
                  <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                    0 entries
                  </span>
                ) : (
                  // Tap the count to see those records: filtered to this category, grouped by category.
                  <Link
                    href={`/records?category=${encodeURIComponent(c.category)}&view=category&all=1`}
                    className="tnum tap text-sm"
                    style={{ color: 'var(--color-muted)' }}
                    title={`View ${c.category} records`}
                  >
                    {countFmt.format(c.count)} {c.count === 1 ? 'entry' : 'entries'}
                  </Link>
                )}
                {c.count === 0 && <DeleteCategoryButton category={c.category} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <datalist id="category-options">
        {counts.map((c) => (
          <option key={c.category} value={c.category} />
        ))}
      </datalist>

      {/* Sticky compose bar — always reachable without scrolling the (long) list, floated clear of the
          fixed tab bar + the expense FAB that overhangs its top-centre. */}
      <div
        className="sticky mt-0"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))', zIndex: 'var(--z-header)' }}
      >
        <div
          className="flex items-center rounded-[var(--radius-lg)] border p-2 backdrop-blur-md"
          style={{
            background: 'color-mix(in oklab, var(--color-surface-2) 92%, transparent)',
            borderColor: 'var(--color-border-strong)',
            boxShadow: 'var(--shadow-2)',
          }}
        >
          <AddCategory names={counts.map((c) => c.category)} />
        </div>
      </div>
    </PageContainer>
  );
}
