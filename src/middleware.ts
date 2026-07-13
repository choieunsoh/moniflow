import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkBasicAuth } from '@shared/basic-auth';

const REALM = 'Moniflow';

// PWA chrome the browser/OS fetches WITHOUT the Basic-auth credentials (manifest install, icons,
// service worker registration). Gating these breaks "install as app" — Chrome falls back to a generic
// tile — and none of them carry financial data. Only the pages, which hold the figures, stay gated.
const PUBLIC_PATHS = new Set([
  '/manifest.webmanifest',
  '/sw.js',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-icon.png',
  '/icon.svg',
]);

// Run on everything except Next's build assets: JS chunks / optimized images carry no user data and
// ride along as authenticated subresources once the origin is unlocked.
export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };

export function middleware(request: NextRequest): NextResponse {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();

  const expected = process.env.MONIFLOW_PASSWORD;

  // Dev with no password set stays open — a Basic prompt on every `npm run dev:web` is pure friction
  // on your own machine. Set MONIFLOW_PASSWORD to exercise the gate locally. Production ALWAYS
  // enforces (unconfigured → 500 below), so a live deploy is never accidentally open.
  if (process.env.NODE_ENV !== 'production' && (expected === undefined || expected === '')) {
    return NextResponse.next();
  }

  const outcome = checkBasicAuth(request.headers.get('authorization'), expected);
  if (outcome === 'ok') return NextResponse.next();
  if (outcome === 'unconfigured') {
    return new NextResponse('Auth not configured (set MONIFLOW_PASSWORD).', { status: 500 });
  }
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}
