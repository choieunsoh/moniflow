// Reads the local SQLite DB per request, same as /dashboard — opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { setCutoffAction } from '@features/settings/actions';
import { PageContainer } from '@shared/ui/PageContainer';

export default function SettingsPage() {
  const db = initDb();
  ensureSettingsTable(db);
  const cutoff = getCutoff(db);

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
            defaultValue={cutoff}
            required
            className="w-24 rounded-[var(--radius-sm)] border px-3 py-2 text-sm"
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
    </PageContainer>
  );
}
