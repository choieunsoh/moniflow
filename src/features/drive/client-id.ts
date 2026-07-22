// The OAuth client id is public and injected at build time. Empty when unset → the whole Drive
// feature is inert/hidden, so a build without it (e.g. the ephemeral demo) is unaffected.
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export function isDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID !== '';
}
