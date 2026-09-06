'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HEADER_ACTIONS_ID } from './AppHeader';

// Puts a route's contextual control into the app header without handing the header that route's
// data. The alternative — another ReactNode prop on AppHeader — would have to be threaded through
// AppShell, which sits above the routes and would then have to load the cycle a SECOND time just to
// decide what to pass; the button's figures are already loaded in the page that renders this.
//
// The target is looked up during render rather than in an effect: an effect + setState is the
// textbook portal shape but it costs a second render pass, and the lint rule that bans setState in
// an effect body is right that this doesn't need one. The lookup is a pure read of a node the header
// committed before any route content existed — every caller reaches here only after its own
// post-mount data has loaded, so `document` is never touched during the static export's prerender.
// The null guard is not optional: createPortal throws on a null container.
export function HeaderAction({ children }: { children: ReactNode }) {
  const slot = typeof document === 'undefined' ? null : document.getElementById(HEADER_ACTIONS_ID);
  return slot === null ? null : createPortal(children, slot);
}
