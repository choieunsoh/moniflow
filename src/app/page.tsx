import Link from 'next/link';

const STEPS = [
  {
    n: '1',
    title: 'Record',
    body: 'Add signed inflows and outflows through the commander CLI, or wire your own ingest adapter.',
  },
  {
    n: '2',
    title: 'Store',
    body: 'Everything lands in one local SQLite file — data/moniflow.db. No server, no account, no cloud.',
  },
  {
    n: '3',
    title: 'See',
    body: 'Server Components read the file directly into a calm dashboard: net flow, balance over time, ledger.',
  },
] as const;

const STACK = [
  'Next 16',
  'React 19',
  'Tailwind v4',
  'Drizzle',
  'better-sqlite3',
  'ECharts',
  'Vitest',
] as const;

export default function Home() {
  return (
    <div className="mx-auto max-w-[1120px] px-4 sm:px-5">
      {/* Hero — a calm brand moment. The radial glow is ambient, low-opacity, purposeful. */}
      <section className="relative isolate flex flex-col items-center gap-7 pt-24 pb-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-10 -z-10 mx-auto h-72 max-w-2xl"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 0%, var(--color-accent-soft), transparent 70%)',
          }}
        />
        <span className="chip">Local-first · single user</span>
        <h1 className="max-w-3xl text-[clamp(2.25rem,5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em]">
          Your money flow, in a file you own.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Moniflow tracks inflows and outflows in a local SQLite database and reads them back as a
          calm, honest dashboard. No cloud, no account — just your data.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard" className="btn btn-primary">
            Open dashboard
          </Link>
          <Link href="#how" className="btn btn-ghost">
            How it works
          </Link>
        </div>
      </section>

      {/* How it works — a genuine ordered pipeline, so the numbers carry real sequence. */}
      <section id="how" className="scroll-mt-20 py-6">
        <ol className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border sm:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex flex-col gap-3 p-6"
              style={{ background: 'var(--color-surface)' }}
            >
              <span
                className="tnum grid size-8 place-items-center rounded-[var(--radius-sm)] text-sm font-semibold"
                style={{
                  background: 'var(--color-accent-soft)',
                  color: 'var(--color-accent-text)',
                }}
              >
                {s.n}
              </span>
              <h3 className="text-base font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Stack strip — quiet, for the developer inheriting this template. */}
      <section className="flex flex-col items-center gap-4 py-16">
        <p className="text-sm" style={{ color: 'var(--color-faint)' }}>
          Scaffolded on a verified stack
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-2">
          {STACK.map((t) => (
            <li key={t} className="chip tnum">
              {t}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
