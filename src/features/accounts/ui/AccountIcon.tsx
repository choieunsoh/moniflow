import { categoryColor } from '@features/categories/color';
import { AccountGlyph } from './AccountGlyph';

// An account marker: the payment-network glyph on a soft hue-tinted disc. `hue` (from the picker)
// overrides the name-derived color. Pure/presentational — no hooks — so it renders in server OR client
// components. Unlike CategoryIcon there is no bold white-icon variant: brand marks carry their own
// colors, so they always sit on the soft tint.
const SIZES = {
  sm: 'size-7',
  md: 'size-10',
  lg: 'size-14',
} as const;

const ICON_PX = { sm: 16, md: 22, lg: 28 } as const;

export function AccountIcon({
  icon,
  name,
  size = 'md',
  hue,
}: {
  icon: string;
  name: string;
  size?: keyof typeof SIZES;
  hue?: number;
}) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full ${SIZES[size]}`}
      style={{ background: `color-mix(in srgb, ${categoryColor(name, hue)} 22%, transparent)` }}
    >
      <AccountGlyph icon={icon} size={ICON_PX[size]} />
    </span>
  );
}
