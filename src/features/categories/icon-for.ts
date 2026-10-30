import type { LucideIcon } from 'lucide-react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { LUCIDE_ICONS } from './icon-map.lucide';
import { PHOSPHOR_ICONS } from './icon-map.phosphor';
import type { IconSet } from '@features/settings/queries';

export type MarkerIcon = LucideIcon | PhosphorIcon;

// The icon map for the active set (undefined in emoji mode). Callers index it by emoji to get the
// component — `iconMapFor(set)?.[emoji]` — which keeps the render-time value a member access into a
// map of static components (not a factory call), satisfying react-hooks/static-components. Shared by
// CategoryIcon (the disc) and the picker grid so both stay in sync with the icon set.
//
// Index it by OWN key only (`Object.hasOwn`): an emoji is stored text a restore file can set, and on
// these plain object literals 'constructor' would index Object itself and render it as a component.
export function iconMapFor(iconSet: IconSet): Record<string, MarkerIcon> | undefined {
  if (iconSet === 'lucide') return LUCIDE_ICONS;
  if (iconSet === 'phosphor') return PHOSPHOR_ICONS;
  return undefined;
}
