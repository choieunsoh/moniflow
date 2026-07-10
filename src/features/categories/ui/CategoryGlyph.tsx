import { iconMapFor } from '../icon-for';
import type { IconSet } from '@features/settings/queries';

// A disc-less category marker for places that already carry their own colour (e.g. the donut legend,
// which sits beside a slice-colour dot). Renders the active set's line icon when one is mapped —
// monochrome via currentColor, inheriting the surrounding text colour — otherwise the emoji glyph.
// This is CategoryIcon's icon lookup without the coloured disc. Pure/presentational — no hooks — so
// it renders in server or client components.
export function CategoryGlyph({
  emoji,
  iconSet = 'emoji',
  size = 16,
}: {
  emoji: string;
  iconSet?: IconSet;
  size?: number;
}) {
  const Icon = iconMapFor(iconSet)?.[emoji];
  return Icon ? <Icon size={size} /> : <span className="leading-none">{emoji}</span>;
}
