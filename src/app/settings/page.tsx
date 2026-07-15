'use client';

import { getBrowserDb } from '@db/browser';
import { useSettings } from '@features/settings/use-settings';
import { ICON_SETS, FONT_SCALES } from '@features/settings/queries';
import {
  setCutoffAction,
  setIconSetAction,
  setCardFeePctAction,
  setFontScaleAction,
} from '@features/settings/actions';
import { WipeAllData } from '@features/settings/ui/WipeAllData';
import { ImportBackup } from '@features/settings/ui/ImportBackup';
import { ImportCatalog } from '@features/settings/ui/ImportCatalog';
import { getEntries } from '@features/entries/queries';
import { serializeMonefyCsv } from '@features/entries/import';
import { getCategoryCatalog } from '@features/categories/queries';
import { getAccountCatalog } from '@features/accounts/queries';
import { serializeCatalogJson } from '@features/settings/catalog';
import { todayIso } from '@shared/date';
import { toast } from '@shared/ui/toast';
import { withSaveToast } from '@shared/ui/with-save-toast';
import { PageContainer } from '@shared/ui/PageContainer';

const ICON_SET_LABELS = {
  emoji: 'Emoji (colorful)',
  phosphor: 'Phosphor (line icons)',
  lucide: 'Lucide (line icons)',
} as const;

const FONT_SCALE_LABELS = {
  sm: 'Small',
  md: 'Default',
  lg: 'Large',
  xl: 'Extra Large',
} as const;

// A static-export app has no GET route handler, so the CSV backup export moves to the client: read
// the ledger from the browser OPFS db, serialize it (the same Monefy-CSV serializer the old
// /settings/backup/export route used), then trigger a download via a throwaway <a download>. Mirrors
// ImportBackup's read-in-the-browser approach for the restore side.
async function exportBackup(): Promise<void> {
  try {
    const db = await getBrowserDb();
    const rows = await getEntries(db);
    const csv = serializeMonefyCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moniflow-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // States the row count, which the browser's own download chrome can't: a silent success is
    // indistinguishable from a swallowed failure, and the count is what tells you the file is the
    // whole ledger and not an empty header. Mirrors the "Restored N entries" toast on the way back in.
    toast(`Exported ${rows.length} entries`);
  } catch {
    toast.error("Couldn't export a backup — try again");
  }
}

// The category emoji/hue/order and account icon/hue/order don't round-trip through the Monefy CSV
// (it only knows entry rows), so this is a second, supplementary JSON export/restore covering just
// that display metadata. Same throwaway-<a download> pattern as exportBackup.
async function exportCatalog(): Promise<void> {
  try {
    const db = await getBrowserDb();
    const [categories, accounts] = await Promise.all([
      getCategoryCatalog(db),
      getAccountCatalog(db),
    ]);
    const json = serializeCatalogJson({ version: 1, categories, accounts });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moniflow-catalog-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    // Counts both, since this file carries two independent lists and "exported" alone wouldn't say
    // whether either was empty. Mirrors "Categories & accounts restored" on the way back in.
    toast(`Exported ${categories.length} categories & ${accounts.length} accounts`);
  } catch {
    toast.error("Couldn't export categories & accounts — try again");
  }
}

export default function SettingsPage() {
  const { ready, data } = useSettings();

  if (!ready || data === null) {
    return (
      <PageContainer size="form">
        <div
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  const { cutoff, iconSet, cardFeePct, fontScale } = data;

  return (
    <PageContainer size="form">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          One global billing-cycle cutoff applies across every account.
        </p>
      </header>

      <section className="panel flex flex-col gap-4 p-5">
        <form action={withSaveToast(setCutoffAction)} className="flex flex-col gap-3">
          <label htmlFor="day" className="text-sm font-medium">
            Billing cutoff day
          </label>
          <input
            id="day"
            name="day"
            type="number"
            min={1}
            max={28}
            inputMode="numeric"
            defaultValue={cutoff}
            required
            className="min-h-11 w-24 rounded-[var(--radius-sm)] border px-3 py-2 text-base"
            style={{ borderColor: 'var(--color-border)' }}
          />
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            A cycle runs from this day of one month to the day before it in the next (e.g. 18 → 17
            for a cutoff of 18). Changing this reinterprets which cycle every existing entry falls
            into — no data is modified or lost.
          </p>
          <button type="submit" className="btn btn-primary w-fit">
            Save
          </button>
        </form>
      </section>

      <section className="panel flex flex-col gap-4 p-5">
        <form action={withSaveToast(setIconSetAction)} className="flex flex-col gap-3">
          <label htmlFor="iconSet" className="text-sm font-medium">
            Category icons
          </label>
          <select
            id="iconSet"
            name="iconSet"
            defaultValue={iconSet}
            className="min-h-11 w-full max-w-xs rounded-[var(--radius-sm)] border px-3 py-2 text-base"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
          >
            {ICON_SETS.map((set) => (
              <option key={set} value={set}>
                {ICON_SET_LABELS[set]}
              </option>
            ))}
          </select>
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            How categories appear everywhere — records, home, the add-expense keypad. Emoji stays
            the underlying label; the line-icon sets render each category&apos;s emoji as a matching
            icon, falling back to the emoji where no icon exists.
          </p>
          <button type="submit" className="btn btn-primary w-fit">
            Save
          </button>
        </form>
      </section>

      <section className="panel flex flex-col gap-4 p-5">
        <form action={withSaveToast(setFontScaleAction)} className="flex flex-col gap-3">
          <label htmlFor="fontScale" className="text-sm font-medium">
            Text size
          </label>
          <select
            id="fontScale"
            name="fontScale"
            defaultValue={fontScale}
            className="min-h-11 w-full max-w-xs rounded-[var(--radius-sm)] border px-3 py-2 text-base"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
          >
            {FONT_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {FONT_SCALE_LABELS[scale]}
              </option>
            ))}
          </select>
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            Scales text across the whole app. The phone frame and tap targets stay the same size —
            only the type grows or shrinks. Applies as soon as you save.
          </p>
          <button type="submit" className="btn btn-primary w-fit">
            Save
          </button>
        </form>
      </section>

      <section className="panel flex flex-col gap-4 p-5">
        <form action={withSaveToast(setCardFeePctAction)} className="flex flex-col gap-3">
          <label htmlFor="pct" className="text-sm font-medium">
            Card FX fee %
          </label>
          <input
            id="pct"
            name="pct"
            type="number"
            min={0}
            max={10}
            step={0.1}
            inputMode="decimal"
            defaultValue={cardFeePct}
            required
            className="min-h-11 w-24 rounded-[var(--radius-sm)] border px-3 py-2 text-base"
            style={{ borderColor: 'var(--color-border)' }}
          />
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            Total markup over the ECB mid-rate — the card network&apos;s cut (~0.5%) plus your
            bank&apos;s foreign-transaction fee — so a non-THB entry&apos;s stored baht approximates
            your statement. Refresh the rate itself from the add-expense keypad.
          </p>
          <button type="submit" className="btn btn-primary w-fit">
            Save
          </button>
        </form>
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Export the whole ledger to a Monefy-compatible CSV, or restore it from one. Restoring
          replaces every current entry. The CSV can&apos;t carry category/account emoji, icon, hue,
          or order — export those separately below and restore is a non-destructive merge.
        </p>
        <button
          type="button"
          className="btn btn-ghost w-fit"
          onClick={() => {
            void exportBackup();
          }}
        >
          Export CSV
        </button>
        <ImportBackup />
        <button
          type="button"
          className="btn btn-ghost w-fit"
          onClick={() => {
            void exportCatalog();
          }}
        >
          Export categories &amp; accounts
        </button>
        <ImportCatalog />
      </section>

      <section
        className="panel flex flex-col gap-3 p-5"
        style={{ borderColor: 'var(--color-loss)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-loss)' }}>
          Danger zone
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Permanently delete every entry, category, and budget. This cannot be undone.
        </p>
        <WipeAllData />
      </section>
    </PageContainer>
  );
}
