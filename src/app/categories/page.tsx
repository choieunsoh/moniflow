// Reads the local SQLite DB per request — better-sqlite3 can't be prerendered, and the category list
// must reflect the latest import/merge/emoji.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCategoryCounts } from '@features/entries/queries';
import { mergeCategoryAction } from '@features/entries/actions';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor } from '@features/categories/queries';
import { EmojiPicker } from '@features/categories/ui/EmojiPicker';
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
  const iconSet = getIconSet(db);

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Tap an emoji to set a category&apos;s icon. Rename a category — or type an existing name —
          to merge it into another.
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
              <li key={c.category} className="flex flex-col gap-2.5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <EmojiPicker
                    category={c.category}
                    current={emojiFor(emojiMap, c.category)}
                    iconSet={iconSet}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.category}</span>
                  <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                    {c.count}
                  </span>
                </div>
                <form action={mergeCategoryAction} className="flex items-center gap-2">
                  <input type="hidden" name="from" value={c.category} />
                  <input
                    name="to"
                    list="category-options"
                    placeholder="rename / merge into…"
                    required
                    className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 text-base"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                  />
                  <button type="submit" className="btn btn-ghost">
                    Apply
                  </button>
                </form>
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
