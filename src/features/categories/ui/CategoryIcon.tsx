import { categoryColor, categoryColorBold } from '../color';
import { LUCIDE_ICONS } from '../icon-map.lucide';
import { PHOSPHOR_ICONS } from '../icon-map.phosphor';
import type { IconSet } from '@features/settings/queries';

// A category marker on a colored disc. `iconSet` picks the render style app-wide:
//   emoji    → the native glyph on a soft tint (the original look)
//   phosphor → a white Phosphor line-icon on a bold disc (Monefy)
//   lucide   → same, with lucide
// An emoji with no library mapping falls back to the glyph, so a mixed set degrades gracefully.
// Pure and presentational — no hooks — so it renders in server OR client components.
const SIZES = {
  sm: 'size-7 text-base',
  md: 'size-10 text-xl',
  lg: 'size-14 text-2xl',
} as const;

const ICON_PX = { sm: 18, md: 24, lg: 30 } as const;

export function CategoryIcon({
  emoji,
  name,
  size = 'md',
  iconSet = 'emoji',
}: {
  emoji: string;
  name: string;
  size?: keyof typeof SIZES;
  iconSet?: IconSet;
}) {
  const Icon =
    iconSet === 'lucide'
      ? LUCIDE_ICONS[emoji]
      : iconSet === 'phosphor'
        ? PHOSPHOR_ICONS[emoji]
        : undefined;

  if (Icon) {
    return (
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-full ${SIZES[size]}`}
        style={{ background: categoryColorBold(name) }}
      >
        <Icon size={ICON_PX[size]} color="#fff" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full leading-none ${SIZES[size]}`}
      style={{ background: `color-mix(in srgb, ${categoryColor(name)} 22%, transparent)` }}
    >
      {emoji}
    </span>
  );
}
