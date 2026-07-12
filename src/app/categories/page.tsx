// Reads the local SQLite DB per request — better-sqlite3 can't be prerendered, and the category list
// must reflect the latest import/merge/emoji.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCategoryCounts } from '@features/entries/queries';
import { ensureCategoriesTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor, getHueMap, hueFor } from '@features/categories/queries';
import { EmojiPicker } from '@features/categories/ui/EmojiPicker';
import { CategoryNameEditor } from '@features/categories/ui/CategoryNameEditor';
import { AddCategory } from '@features/categories/ui/AddCategory';
import { DeleteCategoryButton } from '@features/categories/ui/DeleteCategoryButton';
import { ensureSettingsTable } from '@features/settings/schema';
import { getIconSet } from '@features/settings/queries';
import { PageContainer } from '@shared/ui/PageContainer';
import Link from 'next/link';

const countFmt = new Intl.NumberFormat('en-US');

export default function CategoriesPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  ensureSettingsTable(db);
  const counts = getCategoryCounts(db);
  const emojiMap = getEmojiMap(db);
  const hueMap = getHueMap(db);
  const iconSet = getIconSet(db);

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Add a category below, or tap one&apos;s icon to restyle it and its name to rename (type an
          existing name to merge). An unused category (0) can be deleted.
        </p>
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
                {c.count === 0 ? (
                  <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                    0
                  </span>
                ) : (
                  // Tap the count to see those records: filtered to this category, grouped by category.
                  <Link
                    href={`/records?category=${encodeURIComponent(c.category)}&view=category&all=1`}
                    className="tnum tap text-sm"
                    style={{ color: 'var(--color-muted)' }}
                    title={`View ${c.category} records`}
                  >
                    {countFmt.format(c.count)}
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
