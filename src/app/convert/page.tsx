'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { useConvert } from '@features/currencies/use-convert';
import { resolvePair } from '@features/currencies/convert';
import { Converter } from '@features/currencies/ui/Converter';
import { refreshFxRatesAction } from '@features/settings/actions';

// /convert — a read-only exchange-rate calculator over the cached ECB rates. State rides in the URL
// (?from=&to=&amt=) like every other page; the amount is mirrored into local state so typing never
// waits on a router round-trip, and router.replace keeps keystrokes out of the back stack.
export default function ConvertPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, data } = useConvert();
  const [amount, setAmount] = useState(params.get('amt') ?? '');

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

  const pair = resolvePair(data.codes, params.get('from'), params.get('to'));

  const go = (from: string, to: string, amt: string) => {
    const next = new URLSearchParams({ from, to });
    if (amt !== '') next.set('amt', amt);
    router.replace(`/convert?${next.toString()}`);
  };

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Convert</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          ECB mid rate, plus what an exchange fee adds on top.
        </p>
      </header>
      {pair === null ? (
        <p className="panel p-5 text-sm" style={{ color: 'var(--color-muted)' }}>
          Add a foreign currency on the{' '}
          <Link href="/currency" className="underline">
            Currency
          </Link>{' '}
          page to convert it.
        </p>
      ) : (
        <Converter
          codes={data.codes}
          rates={data.rates}
          cardFeePct={data.cardFeePct}
          from={pair.from}
          to={pair.to}
          amount={amount}
          onAmount={(raw) => {
            setAmount(raw);
            go(pair.from, pair.to, raw);
          }}
          onPair={(from, to) => go(from, to, amount)}
          onRefresh={refreshFxRatesAction}
        />
      )}
    </PageContainer>
  );
}
