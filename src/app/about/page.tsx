'use client';

import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { useBackupStatus } from '@shared/use-backup-status';
import { useStoragePersisted } from '@shared/use-storage-persisted';
import { backupSummary } from '@shared/backup-safety';

// /about — what this app is, which build you are on, and whether your data is safe. Three facts, no
// controls: everything actionable already lives on Settings, and duplicating the export button here
// would give the same job two homes.
//
// The version is the load-bearing one. A static export installed as a PWA gives no other way to tell
// which release is actually running, and an install silently stuck on an old bundle cost four
// releases of "still the same" before anyone could see it. Answering that on the device turns a
// guess into a glance.
export default function AboutPage() {
  const status = useBackupStatus();
  const persisted = useStoragePersisted();

  return (
    <PageContainer size="form">
      <h1 className="sr-only">About Moniflow</h1>

      <section className="panel flex flex-col gap-1 p-5">
        <span className="text-base font-semibold">Moniflow</span>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Your money, quietly in view.
        </span>
      </section>

      <section className="panel flex flex-col gap-4 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          This app
        </h2>

        <Row label="Version">
          {/* Falls back rather than rendering "undefined": the env var is inlined by next.config, so
              a missing one means a build that skipped it, and a blank line reads better than a lie. */}
          <span className="tnum">{process.env.NEXT_PUBLIC_APP_VERSION ?? '—'}</span>
        </Row>

        {/* Withheld entirely while unknown — see useStoragePersisted. Saying "not protected" before
            the browser has answered would claim something worse than the truth about their data. */}
        {persisted === null ? null : (
          <Row label="Storage">
            <span style={{ color: persisted ? 'var(--color-text)' : 'var(--color-muted)' }}>
              {/* Short enough to hold one line at 412px — the longer phrasing wrapped mid-clause
                  and left a one-word orphan under a two-word label. */}
              {persisted ? 'Protected — won’t be evicted' : 'Unprotected — may be evicted'}
            </span>
          </Row>
        )}

        <Row label="Backup">
          <span className="flex flex-col items-end gap-1">
            <span style={{ color: status.overdue ? 'var(--color-loss)' : 'var(--color-text)' }}>
              {backupSummary(status)}
            </span>
            {/* Settings owns the actual export; this only points at it, so there is one place that
                can back up and one place that can go wrong. */}
            <Link
              href="/settings"
              className="text-xs font-medium"
              style={{ color: 'var(--color-accent-text)' }}
            >
              Back up now →
            </Link>
          </span>
        </Row>
      </section>

      <p className="px-1 text-xs leading-relaxed" style={{ color: 'var(--color-faint)' }}>
        Your data never leaves this device. There is no account, no server and no sync — the ledger
        lives in this browser’s storage, so a backup is the only copy that survives it.
      </p>
    </PageContainer>
  );
}

// Label left, value right, wrapping to two lines on a narrow phone rather than squeezing the value.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="shrink-0" style={{ color: 'var(--color-muted)' }}>
        {label}
      </span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}
