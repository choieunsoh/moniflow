export function AppFooter() {
  return (
    <footer className="mt-24 border-t" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mx-auto flex max-w-[1120px] flex-col gap-1 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p style={{ color: 'var(--color-muted)' }}>
          Local-first · your data stays in a SQLite file on your machine.
        </p>
        <p className="tnum text-xs" style={{ color: 'var(--color-faint)' }}>
          scaffolded on the create-sqlite-next-app stack
        </p>
      </div>
    </footer>
  );
}
