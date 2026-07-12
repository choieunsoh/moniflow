// ponytail: categoryColorBold is imported laterally from features/categories rather than graduated to
// shared — deliberate while accounts is only the 2nd consumer (graduate color to @shared on a 3rd).
import { categoryColorBold } from '@features/categories/color';
import { AccountGlyph } from './AccountGlyph';

// An account marker: the payment-network glyph rendered WHITE on a bold hue disc — the same look as a
// phosphor/lucide CategoryIcon, so accounts and categories read as one system. `hue` (from the picker)
// overrides the name-derived color; the disc supplies the color, the glyph inherits white via
// currentColor. Pure/presentational — no hooks — so it renders in server OR client components.
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
      style={{ background: categoryColorBold(name, hue), color: '#fff' }}
    >
      <AccountGlyph icon={icon} size={ICON_PX[size]} />
    </span>
  );
}
