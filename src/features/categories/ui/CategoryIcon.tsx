import { categoryColor, categoryColorBold, discForeground } from '../color';
import { iconMapFor } from '../icon-for';
import type { IconSet } from '@features/settings/queries';

// A category marker on a colored disc. `iconSet` picks the render style app-wide:
//   emoji    → the native glyph on a soft tint (the original look)
//   phosphor → a white Phosphor line-icon on a bold disc (Monefy)
//   lucide   → same, with lucide
// An emoji with no library mapping falls back to the glyph, so a mixed set degrades gracefully.
// Pure and presentational — no hooks — so it renders in server OR client components.
// sm/md share the 44px minimum tap-target floor (size-11); lg stays the roomy grid/dialog size.
const SIZES = {
  sm: 'size-11 text-2xl',
  md: 'size-11 text-2xl',
  lg: 'size-14 text-2xl',
} as const;

const ICON_PX = { sm: 26, md: 26, lg: 30 } as const;

export function CategoryIcon({
  emoji,
  name,
  size = 'md',
  iconSet = 'emoji',
  hue,
}: {
  emoji: string;
  name: string;
  size?: keyof typeof SIZES;
  iconSet?: IconSet;
  // Picked disc hue; undefined falls back to the name-derived color.
  hue?: number;
}) {
  const Icon = iconMapFor(iconSet)?.[emoji];

  if (Icon) {
    return (
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-full ${SIZES[size]}`}
        style={{ background: categoryColorBold(name, hue) }}
      >
        <Icon size={ICON_PX[size]} color={discForeground(hue)} />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full leading-none ${SIZES[size]}`}
      style={{ background: `color-mix(in srgb, ${categoryColor(name, hue)} 22%, transparent)` }}
    >
      {emoji}
    </span>
  );
}
