// Active-nav matching shared by the top Nav and the mobile BottomBar: home is active only on the
// exact "/", every other route is active when the current path is within it (prefix match).
export function isActivePath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}
