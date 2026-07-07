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
  const trimmedFrom = from.trim();
  const trimmedTo = to.trim();
  if (trimmedFrom === '' || trimmedTo === '' || trimmedFrom === trimmedTo) return null;
  return { from: trimmedFrom, to: trimmedTo };
}
