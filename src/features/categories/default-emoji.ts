// Seed icon for a brand-new category, derived from its name.
//
// Every category-creation path used to hardcode the neutral tag, so a Monefy CSV restore — the app's
// flagship onboarding route — produced a ledger where all 22 categories wore the SAME glyph. A
// coloured disc with a meaningless icon inside it is decoration wearing an information costume, and
// at that point the icon column carried no information at all. Naming what it can from the category
// name gives the column its job back on the very first screen after an import.
//
// Pure and DB-free so it can be tested in isolation; the write paths in queries.ts call it in place
// of the bare fallback.

// Shown for any category without an assigned emoji, and for any name below that matches nothing.
export const FALLBACK_EMOJI = '🏷️';

// Ordered keyword table: the FIRST keyword found in the lowercased category name wins. Order is
// therefore load-bearing — a keyword must precede any longer word that CONTAINS it, or the short one
// swallows the long one. The three real collisions here are taxi/tax, petrol/pet and card/car, each
// pinned by its own test.
//
// Deliberately conservative. A confidently wrong icon is worse than the neutral tag, so genuinely
// ambiguous categories (Misc, Insurance, Fees) are left unmapped rather than assigned something
// merely plausible. Every emoji must exist in EMOJI_CHOICES or the picker can't show it as selected
// — enforced by a test rather than by discipline.
export const DEFAULT_EMOJI_KEYWORDS = [
  // Collision-sensitive entries first: each of these is a prefix of, or contained in, a later word.
  ['taxi', '🚕'], // before 'tax'
  ['petrol', '⛽'], // before 'pet'
  ['card', '💳'], // before 'car'

  // Food & drink
  ['grocer', '🛒'],
  ['supermarket', '🛒'],
  ['coffee', '☕'],
  ['cafe', '☕'],
  ['café', '☕'],
  ['tea', '🍵'],
  ['bar', '🍺'],
  ['alcohol', '🍺'],
  ['beer', '🍺'],
  ['wine', '🍷'],
  ['dessert', '🍰'],
  ['snack', '🍰'],
  ['bakery', '🍞'],
  ['restaurant', '🍔'],
  ['dining', '🍔'],
  ['food', '🍔'],
  ['lunch', '🍔'],
  ['dinner', '🍔'],
  ['breakfast', '🍔'],

  // Tech — ABOVE the home block on purpose. "Electronics and Household Appliances" contains both
  // 'electronic' and 'household'; the leading noun is the subject, so tech wins the compound while a
  // bare "Household" still falls through to 🏠 below. No tech keyword collides with 'phone'/'mobile',
  // so a phone bill still reads as a phone.
  ['laptop', '💻'],
  ['computer', '💻'],
  ['electronic', '💻'],
  ['software', '💻'],
  ['subscription', '💻'],

  // Home & bills
  ['rent', '🏠'],
  ['mortgage', '🏠'],
  ['household', '🏠'],
  ['home', '🏠'],
  ['hotel', '🏨'],
  ['accommodation', '🏨'],
  ['utilit', '💡'],
  ['electric', '💡'],
  ['water', '🚰'],
  ['internet', '📶'],
  ['wifi', '📶'],
  ['phone', '📱'],
  ['mobile', '📱'],
  ['bill', '🧾'],
  ['tax', '🧾'],
  ['repair', '🔧'],
  ['maintenance', '🔧'],
  ['cleaning', '🧹'],

  // Transport & travel
  ['fuel', '⛽'],
  ['gasoline', '⛽'],
  ['flight', '✈️'],
  ['airline', '✈️'],
  ['travel', '🧳'],
  ['vacation', '🧳'],
  ['holiday', '🧳'],
  ['trip', '🧳'],
  ['train', '🚆'],
  ['metro', '🚆'],
  ['subway', '🚆'],
  ['bus', '🚌'],
  ['transport', '🚌'],
  ['commut', '🚌'],
  ['scooter', '🛵'],
  ['motorbike', '🛵'],

  // Health
  ['pharmac', '💊'],
  ['medicine', '💊'],
  ['hospital', '🏥'],
  ['clinic', '🏥'],
  ['doctor', '🏥'],
  ['dental', '🏥'],
  ['medical', '🏥'],
  ['health', '🏥'],

  // Shopping & personal
  ['clothes', '👕'],
  ['clothing', '👕'],
  ['apparel', '👕'],
  ['shoe', '👟'],
  ['jewel', '💍'],
  ['shopping', '🛍️'],
  ['gift', '🎁'],
  ['beauty', '💇'],
  ['salon', '💇'],
  ['barber', '💇'],
  ['haircut', '💇'],

  // Leisure
  ['game', '🎮'],
  ['gaming', '🎮'],
  ['movie', '🎬'],
  ['cinema', '🎬'],
  ['entertain', '🎬'],
  ['music', '🎵'],
  ['book', '📚'],
  ['sport', '🏋️'],
  ['gym', '🏋️'],
  ['fitness', '🏋️'],
  ['pet', '🐶'],

  // Money & learning
  ['saving', '💰'],
  ['bank', '🏦'],
  ['invest', '📈'],
  ['stock', '📈'],
  ['education', '🎓'],
  ['school', '🎓'],
  ['tuition', '🎓'],
  ['course', '🎓'],
  ['kid', '🧸'],
  ['child', '🧸'],
  ['baby', '🧸'],
  ['toy', '🧸'],

  // Thai. NOT an afterthought or a nicety: moniflow is a THB, Bangkok-timezone tracker whose import
  // path is a Monefy export, so Thai category names are the EXPECTED case. An English-only table
  // left a real ledger with eleven of twelve categories still wearing the neutral tag — the icon
  // column stayed decorative for exactly the user the app is built for.
  //
  // Ordering inside this block matters for the same substring reason as above, with a sharper edge:
  // Thai has no word spaces, so short words turn up inside longer unrelated ones. 'ยา' (medicine)
  // sits inside 'รักษาพยาบาล' (medical treatment), so the longer terms come first. Bare 'ชา' (tea)
  // is left out entirely — too short to match safely.
  ['รักษาพยาบาล', '🏥'],
  ['โรงพยาบาล', '🏥'],
  ['สุขภาพ', '🏥'],
  ['หมอ', '🏥'],
  ['ยา', '💊'],

  ['ช็อปปิ้ง', '🛍️'],
  ['สะดวกซื้อ', '🛒'],
  ['ซุปเปอร์', '🛒'],
  ['ของใช้', '🏠'],

  ['บิล', '🧾'],
  ['ภาษี', '🧾'],
  ['ผ่อน', '💳'],
  ['บัตรเครดิต', '💳'],
  ['ค่าไฟ', '💡'],
  ['ค่าน้ำ', '🚰'],
  ['อินเทอร์เน็ต', '📶'],
  ['โทรศัพท์', '📱'],
  ['ค่าเช่า', '🏠'],
  ['เช่าบ้าน', '🏠'],

  ['กาแฟ', '☕'],
  ['ขนม', '🍰'],
  ['ร้านอาหาร', '🍔'],
  ['อาหาร', '🍔'],
  ['เบียร์', '🍺'],
  ['เหล้า', '🍺'],

  ['รถไฟ', '🚆'],
  ['รถเมล์', '🚌'],
  ['แท็กซี่', '🚕'],
  ['น้ำมัน', '⛽'],
  ['เดินทาง', '🧳'],
  ['ท่องเที่ยว', '🧳'],
  ['โรงแรม', '🏨'],

  ['เสื้อผ้า', '👕'],
  ['รองเท้า', '👟'],
  ['ของขวัญ', '🎁'],
  ['ตัดผม', '💇'],
  ['ทำผม', '💇'],
  ['ความงาม', '💇'],

  ['เกม', '🎮'],
  ['หนังสือ', '📚'],
  ['ภาพยนตร์', '🎬'],
  ['เพลง', '🎵'],
  ['กีฬา', '🏋️'],
  ['ฟิตเนส', '🏋️'],
  ['สัตว์เลี้ยง', '🐶'],

  ['การศึกษา', '🎓'],
  ['ค่าเทอม', '🎓'],
  ['ธนาคาร', '🏦'],
  ['เงินออม', '💰'],
  ['ลงทุน', '📈'],
  ['ซ่อม', '🔧'],
] as const satisfies readonly (readonly [string, string])[];

// The category's seed icon, or the neutral tag when nothing matches confidently.
export function defaultEmojiFor(name: string): string {
  const haystack = name.toLowerCase();
  for (const [keyword, emoji] of DEFAULT_EMOJI_KEYWORDS) {
    if (haystack.includes(keyword)) return emoji;
  }
  return FALLBACK_EMOJI;
}
