'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEditEntry } from '@features/entries/use-edit-entry';
import { editEntryAction } from '@features/entries/actions';
import { EntryForm } from '@features/entries/ui/EntryForm';
import { Keypad } from '@features/entries/ui/Keypad';
import { CloseButton } from '@features/entries/ui/CloseButton';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';
import { toast } from '@shared/ui/toast';

// The entry + keypad-feeding lists load client-side via useEditEntry against the browser OPFS db. The
// entry id comes from the query string (?id=) rather than a dynamic [id] segment: `output: 'export'`
// can't statically render per-id routes, so this is one static /entries/edit page parameterised by
// ?id=. useSearchParams needs a Suspense boundary under static export, hence the split.
function EditEntryInner() {
  const router = useRouter();
  const id = Number(useSearchParams().get('id'));
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
          <CloseButton className="-mr-1" />
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
    toast('Entry saved');
    router.push('/records');
  }

  if (data.keypadEditable) {
    const {
      entry,
      categories,
      accounts,
      currencies,
      notes,
      rates,
      ratesAsOf,
      iconSet,
      keypadLayout,
      offBudgetCategories,
    } = data;
    return (
      <PageContainer size="full">
        {/* Title + caption dropped and the close moved into the keypad's chip row — see the new-entry
            route for the reasoning. The two branches below keep their headers: neither renders a
            Keypad, so there's no chip row for the × to live in. */}
        <h1 className="sr-only">Edit expense</h1>
        <Keypad
          categories={categories}
          accounts={accounts}
          currencies={currencies}
          notes={notes}
          rates={rates}
          ratesAsOf={ratesAsOf}
          defaultAccount={entry.account}
          today={todayIso()}
          iconSet={iconSet}
          keypadLayout={keypadLayout}
          action={handleSubmit}
          entry={entry}
          offBudgetCategories={offBudgetCategories}
        />
      </PageContainer>
    );
  }

  const { entry, accounts, categories, notes, offBudgetCategories } = data;
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
      <EntryForm
        action={handleSubmit}
        accounts={accounts}
        categories={categories}
        notes={notes}
        entry={entry}
        offBudgetCategories={offBudgetCategories}
      />
    </PageContainer>
  );
}

export default function EditEntryPage() {
  return (
    <Suspense
      fallback={
        <PageContainer size="full">
          <div
            className="grid h-32 place-items-center text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            …
          </div>
        </PageContainer>
      }
    >
      <EditEntryInner />
    </Suspense>
  );
}
