// A rename turns into a MERGE when the typed name already exists as a *different* category: the
// action folds this category's entries into that one, which can't be cleanly undone. The name editor
// asks for confirmation before submitting in that case. Pure so it's unit-tested directly; the editor
// reads `existing` from the shared #category-options datalist (the client-side list of category
// names). `next` is trimmed here to match how parseMergeInput trims the submitted value.
export function willMerge(next: string, from: string, existing: Iterable<string>): boolean {
  const trimmed = next.trim();
  if (trimmed === '' || trimmed === from) return false;
  for (const name of existing) if (name === trimmed) return true;
  return false;
}
