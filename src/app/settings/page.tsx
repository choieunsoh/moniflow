// Reads the local SQLite DB per request, same as /dashboard — opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff, getIconSet, ICON_SETS, getCardFeePct } from '@features/settings/queries';
import { setCutoffAction, setIconSetAction, setCardFeePctAction } from '@features/settings/actions';
import { WipeAllData } from '@features/settings/ui/WipeAllData';
import { ImportBackup } from '@features/settings/ui/ImportBackup';
import { PageContainer } from '@shared/ui/PageContainer';

const ICON_SET_LABELS = {
  emoji: 'Emoji (colorful)',
  phosphor: 'Phosphor (line icons)',
  lucide: 'Lucide (line icons)',
} as const;

export default function SettingsPage() {
  const db = initDb();
  ensureSettingsTable(db);
  const cutoff = getCutoff(db);
  const iconSet = getIconSet(db);
  const cardFeePct = getCardFeePct(db);

  return (
    <PageContainer size="form">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          One global billing-cycle cutoff applies across every account.
        </p>
      </header>

      <section className="panel flex flex-col gap-4 p-5">
        <form action={setCutoffAction} className="flex flex-col gap-3">
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
        <form action={setIconSetAction} className="flex flex-col gap-3">
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
        <form action={setCardFeePctAction} className="flex flex-col gap-3">
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
          replaces every current entry.
        </p>
        <a href="/settings/backup/export" download className="btn btn-ghost w-fit">
          Export CSV
        </a>
        <ImportBackup />
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
