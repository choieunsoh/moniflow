import { formatBaht } from '@shared/money';

// "Spent" cannot precede a minus sign. A category whose refunds outweighed its spend did not
// spend a negative amount, it handed money back, so the wording changes with the sign rather
// than the number wearing one. Zero stays "spent": nothing was handed back.
export function spentLine(spent: number): string {
  return spent < 0 ? `${formatBaht(-spent)} refunded` : `${formatBaht(spent)} spent`;
}
