import { categoryColor } from '../color';

// Emoji centered on a soft colored disc (Monefy look). Pure and presentational — no hooks, no
// interactivity — so it's safe to render in server OR client components. The disc color is derived
// from the name, not stored.
const SIZES = {
  sm: 'size-7 text-base',
  md: 'size-10 text-xl',
  lg: 'size-14 text-2xl',
} as const;

export function CategoryIcon({
  emoji,
  name,
  size = 'md',
}: {
  emoji: string;
  name: string;
  size?: keyof typeof SIZES;
}) {
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
