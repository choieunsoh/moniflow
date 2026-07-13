// Decision core for the Basic-auth gate, split out from the Next middleware so the security branches
// are unit-testable without constructing NextRequest/NextResponse. Pure: Authorization header in,
// verdict out. Username is ignored — only the password must match.
export type AuthOutcome = 'ok' | 'unconfigured' | 'challenge';

export function checkBasicAuth(header: string | null, expected: string | undefined): AuthOutcome {
  // Fail closed: with no password configured the caller must NOT be let through (it returns 500,
  // never a silent open door on a misconfigured deploy).
  if (expected === undefined || expected === '') return 'unconfigured';

  const [scheme, encoded] = (header ?? '').split(' ');
  if (scheme !== 'Basic' || encoded === undefined || encoded === '') return 'challenge';

  let decoded: string;
  try {
    decoded = atob(encoded); // "user:password"
  } catch {
    return 'challenge'; // malformed base64 → challenge, never throw
  }
  // Password is everything after the first colon, so colons inside the password survive.
  const password = decoded.slice(decoded.indexOf(':') + 1);

  // ponytail: plain compare — a timing attack on a personal ledger behind a login isn't the threat
  // model. Swap for a constant-time compare if this ever guards more than my own figures.
  return password === expected ? 'ok' : 'challenge';
}
