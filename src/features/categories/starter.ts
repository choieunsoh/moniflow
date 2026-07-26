// The starter set offered when the picker is empty — the app's way out of a first-run dead end: a
// fresh ledger has no categories and no accounts, and the keypad can only pick from what exists.
//
// Deliberately generic and deliberately SMALL. These are a scaffold to rename, not a taxonomy: the
// categories page already renames and merges, and the keypad now creates one inline, so ten broad
// buckets beat a long list nobody reads. Real ledgers diverge fast — the one this was built against
// grew forty categories, none of which belong in anyone else's app.
//
// Every name except "Other" resolves to a real glyph through defaultEmojiFor's keyword table, so the
// set arrives already iconed. "Other" is unmapped on purpose (see default-emoji: a confidently wrong
// icon is worse than the neutral tag), and a test pins that split so a reworded entry can't silently
// fall back to 🏷️ for everything.
export const STARTER_CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Bills',
  'Shopping',
  'Health',
  'Entertainment',
  'Travel',
  'Home',
  'Other',
] as const;

// The one name that is intentionally iconless — kept as a named export so the test asserts the
// exception rather than hardcoding it twice.
export const STARTER_UNICONED = 'Other';

// Two accounts, because every expense needs one and the split that matters on day one is "did this
// leave my pocket or my credit line". Anything finer (which card, which bank) is personal and gets
// added from the accounts page.
export const STARTER_ACCOUNTS = ['Cash', 'Card'] as const;
