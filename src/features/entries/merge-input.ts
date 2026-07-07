export type MergeInput = { from: string; to: string };

// Pure validation for the category rename/merge form, kept out of the 'use server' actions module
// so it can be unit-tested directly — mirrors how parseEntryForm lives in entry-form.ts, not in
// actions.ts. (A 'use server' file may only export async functions, so a sync parser can't live
// there.) mergeCategoryAction wires this to the DB and revalidatePath — thin enough to verify by
// hand via the /categories page rather than mock the Next.js server-action runtime.
export function parseMergeInput(formData: FormData): MergeInput | null {
  const from = formData.get('from');
  const to = formData.get('to');
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  // `from` is the exact stored category key (a hidden field bound verbatim from the DB), so it must
  // match byte-for-byte and is NOT trimmed — the Monefy import stores categories un-trimmed, so a
  // whitespace fragment like 'อาหาร ' is a real, distinct key. Trimming it here would make the
  // rename target the WRONG rows, or make a fragment→clean rename look like a no-op. Only `to`
  // (free user text) is trimmed. The equality guard compares the raw `from` to the trimmed `to`.
  const trimmedTo = to.trim();
  if (from === '' || trimmedTo === '' || from === trimmedTo) return null;
  return { from, to: trimmedTo };
}
