// Which categories drove this cycle's change vs the previous one — the "why" behind the single
// CycleDeltaCard total. Reads the in-memory matrix use-analytics already builds (magnitudes), so no
// extra query. delta = active − prev; positive means you spent MORE this cycle. A category present in
// only one of the two cycles counts its whole side (missing side = 0). Zero-net categories are noise
// in a "what changed" list, so they're dropped. Ranked by magnitude, ties by name for a stable order.
export type DeltaContributor = { category: string; delta: number };

export function deltaByCategory(
  matrix: Map<string, Map<string, { total: number; count: number }>>,
  activeKey: string,
  prevKey: string,
): DeltaContributor[] {
  const active = matrix.get(activeKey);
  const prev = matrix.get(prevKey);
  if (active === undefined || prev === undefined) return [];

  const names = new Set<string>();
  for (const name of active.keys()) names.add(name);
  for (const name of prev.keys()) names.add(name);

  const rows: DeltaContributor[] = [];
  for (const name of names) {
    const delta = (active.get(name)?.total ?? 0) - (prev.get(name)?.total ?? 0);
    if (delta !== 0) rows.push({ category: name, delta });
  }
  return rows.sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.category.localeCompare(b.category),
  );
}
