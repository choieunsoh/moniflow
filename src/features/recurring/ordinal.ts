// 1st/2nd/3rd/4th… Correct across the 1–31 day-of-month range this renders: 11th/12th/13th are the
// only irregular cases, and 21st/22nd/23rd/31st fall out of the n % 10 switch. Shared by the rules
// list and the rule keypad, which must name a day the same way.
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
