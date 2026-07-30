'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEditRule } from '@features/recurring/use-edit-rule';
import { editRuleAction } from '@features/recurring/actions';
import { RuleKeypad } from '@features/recurring/ui/RuleKeypad';
import { CloseButton } from '@features/entries/ui/CloseButton';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';
import { toast } from '@shared/ui/toast';

// The rule + keypad-feeding lists load client-side via useEditRule against the browser OPFS db. The
// rule id comes from the query string (?id=) rather than a dynamic [id] segment: `output: 'export'`
// can't statically render per-id routes, so this is one static /recurring/edit page parameterised by
// ?id=. useSearchParams needs a Suspense boundary under static export, hence the split — the same
// shape /entries/edit uses.
function EditRuleInner() {
  const router = useRouter();
  const id = Number(useSearchParams().get('id'));
  const { ready, data } = useEditRule(id);

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
            <h1 className="text-2xl font-semibold">Rule not found</h1>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              This rule may have already been archived.
            </p>
          </div>
          <CloseButton className="-mr-1" />
        </header>
        <Link
          href="/recurring"
          className="text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          Back to recurring
        </Link>
      </PageContainer>
    );
  }

  const {
    rule,
    category,
    account,
    categories,
    accounts,
    currencies,
    currencyCodes,
    rates,
    ratesAsOf,
    iconSet,
    keypadLayout,
  } = data;

  async function handleSubmit(formData: FormData): Promise<void> {
    await editRuleAction(formData);
    toast('Rule saved');
    router.push('/recurring');
  }

  return (
    <PageContainer size="full">
      {/* Title dropped and the close control living in the keypad's chip row — see the new-rule route
          for the reasoning. The not-found branch above keeps its header: it renders no keypad, so
          there is no chip row for the × to live in. */}
      <h1 className="sr-only">Edit recurring rule</h1>
      <RuleKeypad
        categories={categories}
        accounts={accounts}
        currencies={currencies}
        currencyCodes={currencyCodes}
        rates={rates}
        ratesAsOf={ratesAsOf}
        defaultAccount={account}
        today={todayIso()}
        iconSet={iconSet}
        keypadLayout={keypadLayout}
        action={handleSubmit}
        rule={rule}
        ruleCategory={category}
        ruleAccount={account}
      />
    </PageContainer>
  );
}

export default function EditRulePage() {
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
      <EditRuleInner />
    </Suspense>
  );
}
