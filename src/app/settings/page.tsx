'use client';

import { useStoragePersisted } from '@shared/use-storage-persisted';
import { useSettings } from '@features/settings/use-settings';
import { useBackupData, type BackupFile } from '@features/settings/use-backup-data';
import { ICON_SETS, FONT_SCALES, KEYPAD_LAYOUTS } from '@features/settings/queries';
import {
  setCutoffAction,
  setIconSetAction,
  setCardFeePctAction,
  setFontScaleAction,
  setKeypadLayoutAction,
} from '@features/settings/actions';
import { WipeAllData } from '@features/settings/ui/WipeAllData';
import { ImportBackup } from '@features/settings/ui/ImportBackup';
import { DriveBackup } from '@features/drive/ui/DriveBackup';
import { saveFile } from '@shared/save-file';
import { bumpDataVersion } from '@shared/data-version';
import { useBackupStatus } from '@shared/use-backup-status';
import { writeLastBackupAt } from '@shared/backup-safety';
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

const KEYPAD_LAYOUT_LABELS = {
  calc: 'Calculator (7-8-9 top)',
  phone: 'Phone (1-2-3 top)',
} as const;

// A static-export app has no GET route handler, so the backup export happens in the client: the file
// is serialized on mount by useBackupData, and the tap only hands it to saveFile — the OS share sheet
// where there is one (Drive, Gmail…), a download otherwise.
//
// Nothing is awaited before saveFile ON PURPOSE. navigator.share() must be reached while the tap's
// transient user activation is still live; awaiting the OPFS read here (which is what this used to
// do) makes Android Chrome reject the sheet with NotAllowedError, and the export silently fell back
// to a download. Keep these handlers synchronous up to the saveFile call.
async function exportFile(file: BackupFile, done: string): Promise<void> {
  try {
    await saveFile(file.name, file.type, file.text);
    // Only on a genuine success: stamp this device's last-backup time, then bump so useBackupStatus
    // re-reads it everywhere — the overdue nudge here and the dot on the More tab both clear at once.
    writeLastBackupAt(Date.now());
    bumpDataVersion();
    // States the count, which the browser's own download chrome can't: a silent success is
    // indistinguishable from a swallowed failure, and the count is what tells you the file is the
    // whole ledger and not an empty header. Mirrors the "Restored N entries" toast on the way back in.
    toast(done);
  } catch {
    toast.error("Couldn't export — try again");
  }
}

const days = new Intl.NumberFormat('en-US');

export default function SettingsPage() {
  const { ready, data } = useSettings();
  // Serialized ahead of the tap so the export handlers can reach navigator.share synchronously.
  const { ready: backupReady, data: backup } = useBackupData();
  // Backup freshness (nudge) and whether OPFS is protected (transparency line). Both are honest-
  // ceiling signals for a browser-only ledger — see shared/backup-safety.ts.
  const { overdue: backupOverdue, daysSince } = useBackupStatus();
  const persisted = useStoragePersisted();

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

  const { cutoff, iconSet, cardFeePct, fontScale, keypadLayout } = data;

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
        <form action={withSaveToast(setKeypadLayoutAction)} className="flex flex-col gap-3">
          <label htmlFor="keypadLayout" className="text-sm font-medium">
            Keypad layout
          </label>
          <select
            id="keypadLayout"
            name="keypadLayout"
            defaultValue={keypadLayout}
            className="min-h-11 w-full max-w-xs rounded-[var(--radius-sm)] border px-3 py-2 text-base"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
          >
            {KEYPAD_LAYOUTS.map((layout) => (
              <option key={layout} value={layout}>
                {KEYPAD_LAYOUT_LABELS[layout]}
              </option>
            ))}
          </select>
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            Digit order on the add-expense keypad. Calculator puts 7-8-9 on top; Phone puts 1-2-3 on
            top. Only the digits move — the operator column stays put.
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
          Export everything — the whole ledger plus your categories, accounts, recurring rules,
          budgets, and settings — to a single file, or restore from one. On a phone it opens the
          share sheet, so a backup can go straight to Drive; elsewhere it downloads. Restoring
          replaces every current entry; everything else is merged in, never deleted. Restore also
          accepts a plain Monefy CSV (ledger only), so imports from Monefy still work.
        </p>
        {persisted !== null ? (
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            {persisted
              ? 'Storage: protected — this device won’t clear your ledger to free space.'
              : 'Storage: not protected — export regularly to be safe.'}
          </p>
        ) : null}
        {backupOverdue ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {daysSince === null
              ? 'You haven’t backed up yet.'
              : `Last backed up ${days.format(daysSince)} ${daysSince === 1 ? 'day' : 'days'} ago.`}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost w-fit"
          disabled={!backupReady || backup === null}
          onClick={() => {
            if (backup === null) return;
            void exportFile(
              backup.file,
              `Exported ${backup.entryCount} entries, ${backup.categoryCount} categories, ${backup.accountCount} accounts & ${backup.budgetCount} budgets`,
            );
          }}
        >
          Export backup
        </button>
        <ImportBackup />
        <DriveBackup />
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
