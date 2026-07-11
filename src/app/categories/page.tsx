// Reads the local SQLite DB per request — better-sqlite3 can't be prerendered, and the category list
// must reflect the latest import/merge/emoji.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCategoryCounts } from '@features/entries/queries';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor, getHueMap, hueFor } from '@features/categories/queries';
import { EmojiPicker } from '@features/categories/ui/EmojiPicker';
import { CategoryNameEditor } from '@features/categories/ui/CategoryNameEditor';
import { ensureSettingsTable } from '@features/settings/schema';
import { getIconSet } from '@features/settings/queries';
import { PageContainer } from '@shared/ui/PageContainer';

export default function CategoriesPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoryMetaTable(db);
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
          Tap a category&apos;s icon to restyle it, or its name to rename — type an existing name to
          merge two together.
        </p>
      </header>

      <section className="panel overflow-hidden">
        {counts.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--color-muted)' }}>
            No categories yet — import or add some entries first.
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
                <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                  {c.count}
                </span>
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
    </PageContainer>
  );
}
