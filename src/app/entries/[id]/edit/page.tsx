'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEditEntry } from '@features/entries/use-edit-entry';
import { editEntryAction } from '@features/entries/actions';
import { EntryForm } from '@features/entries/ui/EntryForm';
import { Keypad } from '@features/entries/ui/Keypad';
import { CloseButton } from '@features/entries/ui/CloseButton';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';

// The entry + keypad-feeding lists load client-side via useEditEntry against the browser OPFS db
// (route id comes from useParams — a client component can't await the server `params` Promise).
// editEntryAction no longer redirects server-side (Plan 2b dropped it), so this page navigates to
// /records after a successful submit instead.
export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { ready, data } = useEditEntry(id);

  if (!ready) {
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

  if (data === null) {
    return (
      <PageContainer size="form">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Entry not found</h1>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              This entry may have already been deleted.
            </p>
          </div>
          <CloseButton />
        </header>
        <Link
          href="/records"
          className="text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          Back to records
        </Link>
      </PageContainer>
    );
  }

  async function handleSubmit(formData: FormData): Promise<void> {
    await editEntryAction(formData);
    router.push('/records');
  }

  if (data.keypadEditable) {
    const { entry, categories, accounts, currencies, rates, ratesAsOf, iconSet } = data;
    return (
      <PageContainer size="full">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Edit expense</h1>
            <p className="text-sm" style={{ color: 'var(--color-faint)' }}>
              Tap a category to save your changes.
            </p>
          </div>
          <CloseButton />
        </header>
        <Keypad
          categories={categories}
          accounts={accounts}
          currencies={currencies}
          rates={rates}
          ratesAsOf={ratesAsOf}
          defaultAccount={entry.account}
          today={todayIso()}
          iconSet={iconSet}
          action={handleSubmit}
          entry={entry}
        />
      </PageContainer>
    );
  }

  const { entry, accounts, categories } = data;
  return (
    <PageContainer size="form">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Edit entry</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Update this ledger row.
          </p>
        </div>
        <CloseButton />
      </header>
      <EntryForm action={handleSubmit} accounts={accounts} categories={categories} entry={entry} />
    </PageContainer>
  );
}
