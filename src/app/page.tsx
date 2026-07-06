export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Moniflow</h1>
      <p className="text-[var(--color-muted)]">
        Personal money-flow dashboard — local-first over SQLite, read through the query layer by
        Server Components. Scaffolded on Next 16 · React 19 · Tailwind v4 · Drizzle.
      </p>
      <p className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-gain)]">
        ✓ stack wired
      </p>
    </main>
  );
}
