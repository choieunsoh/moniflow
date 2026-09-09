'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNewEntry } from '@features/entries/use-new-entry';
import { addEntryAction } from '@features/entries/actions';
import { Keypad } from '@features/entries/ui/Keypad';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';
import { toast } from '@shared/ui/toast';

// The keypad-feeding lists load client-side via useNewEntry against the browser OPFS db. The write
// itself (addEntryAction) no longer redirects server-side (Plan 2b dropped it), so this page navigates
// home after a successful submit instead.
//
// ?copy=<id> opens the keypad pre-filled from an existing row (the Duplicate control on the edit
// screen). Same shape as /entries/edit?id=: a static export cannot prerender a per-id route, so the
// id rides in the query string — which means useSearchParams, which means a Suspense boundary.
function NewEntryInner() {
  const router = useRouter();
  const copyParam = Number(useSearchParams().get('copy'));
  const copyId = Number.isInteger(copyParam) && copyParam > 0 ? copyParam : undefined;
  const { ready, data } = useNewEntry(copyId);

  if (!ready || data === null) {
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

  const {
    categories,
    accounts,
    currencies,
    currencyCodes,
    notes,
    rates,
    ratesAsOf,
    defaultAccount,
    iconSet,
    keypadLayout,
    offBudgetCategories,
    travelCurrencies,
    template,
  } = data;

  async function handleSubmit(formData: FormData): Promise<void> {
    await addEntryAction(formData);
    toast('Entry saved'); // module-level store + layout ToastRegion persist across the navigation
    router.push('/');
  }

  return (
    <PageContainer size="full">
      {/* The visible title and its "keypad does math / tap a category to save" caption are gone: the
          screen says both already (the accent ＋ − × ÷ keys, the "Choose category" button), and the
          ~90px they cost was the difference between that button sitting above or below the fold on a
          412px frame. The heading stays for screen readers, which have no keypad to look at, and the
          close control moved into the keypad's own date/currency/account row. */}
      <h1 className="sr-only">Add expense</h1>
      <Keypad
        categories={categories}
        accounts={accounts}
        currencies={currencies}
        currencyCodes={currencyCodes}
        notes={notes}
        rates={rates}
        ratesAsOf={ratesAsOf}
        defaultAccount={defaultAccount}
        today={todayIso()}
        iconSet={iconSet}
        keypadLayout={keypadLayout}
        action={handleSubmit}
        entry={template ?? undefined}
        isCopy={template !== null}
        offBudgetCategories={offBudgetCategories}
        travelCurrencies={travelCurrencies}
      />
    </PageContainer>
  );
}

export default function NewEntryPage() {
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
      <NewEntryInner />
    </Suspense>
  );
}
