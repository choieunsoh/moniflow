// Reads the local SQLite DB per request for the category/account lists, so opt out of static gen.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getDistinctAccounts, getCategoryCounts } from '@features/entries/queries';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor, getHueMap, hueFor } from '@features/categories/queries';
import { ensureSettingsTable } from '@features/settings/schema';
import { getIconSet } from '@features/settings/queries';
import { Keypad } from '@features/entries/ui/Keypad';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';

export default function NewEntryPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoryMetaTable(db);
  ensureSettingsTable(db);

  const emojiMap = getEmojiMap(db);
  const hueMap = getHueMap(db);
  const iconSet = getIconSet(db);
  // Most-used categories first, so the common ones are at the top of the picker grid.
  const categories = getCategoryCounts(db).map((c) => ({
    name: c.category,
    emoji: emojiFor(emojiMap, c.category),
    hue: hueFor(hueMap, c.category),
  }));
  const accounts = getDistinctAccounts(db);

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Add expense</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Type the amount (＋ − × ÷ work), then choose a category to save.
        </p>
      </header>
      <Keypad
        categories={categories}
        accounts={accounts}
        defaultAccount={accounts[0] ?? ''}
        today={todayIso()}
        iconSet={iconSet}
      />
    </PageContainer>
  );
}
