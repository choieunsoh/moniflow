// Forward the active billing cycle across top-level tab navigation so picking a past cycle on one
// page carries to the next — the cycle is the app's primary axis and should feel global, not reset
// on every tab tap. Only the `cycle` param rides along; page-specific filters (search, category)
// intentionally do not.
export function cycleHref(path: string, cycle: string | null): string {
  return cycle ? `${path}?cycle=${cycle}` : path;
}
