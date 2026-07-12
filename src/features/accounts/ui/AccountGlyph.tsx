import type { ReactElement } from 'react';
import { FALLBACK_ICON } from '../queries';

// A payment-network glyph resolved from an icon KEY (the divergence from categories, which store a free
// emoji). Every glyph is a monochrome `currentColor` silhouette, so it renders white on AccountIcon's
// bold hue disc — the same look as a phosphor/lucide CategoryIcon. Unknown keys fall back to the generic
// card. Pure/presentational — no hooks. `viewBox` is a 24-unit square for every glyph so `size` scales
// them uniformly.
type GlyphProps = { size: number };

function Cash({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 9v6M19 9v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Card({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 9.5h20" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Qr({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M14 14h3v3M20 14v0M17 20h4M20 17v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The brand marks are monochrome currentColor silhouettes: they render WHITE on AccountIcon's bold
// hue disc (the same look as a phosphor/lucide CategoryIcon). Wordmarks for Visa/JCB/Amex; the
// Mastercard rings and the UnionPay overlapping bars carry the shape identity without color.
function Visa({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="700"
        fontStyle="italic"
        fontFamily="Arial, sans-serif"
        fill="currentColor"
        letterSpacing="0.3"
      >
        VISA
      </text>
    </svg>
  );
}

function Mastercard({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9.4" cy="12" r="5.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14.6" cy="12" r="5.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Jcb({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        fill="currentColor"
        letterSpacing="0.3"
      >
        JCB
      </text>
    </svg>
  );
}

function UnionPay({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* three overlapping slanted bars — the UnionPay motif, varying opacity for depth in one color */}
      <path d="M7 6h3l-3 12H4z" fill="currentColor" opacity="0.55" />
      <path d="M11 6h3l-3 12H8z" fill="currentColor" opacity="0.78" />
      <path d="M15 6h3l-3 12h-3z" fill="currentColor" />
    </svg>
  );
}

function Amex({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <text
        x="12"
        y="14.8"
        textAnchor="middle"
        fontSize="5"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        fill="currentColor"
        letterSpacing="0.2"
      >
        AMEX
      </text>
    </svg>
  );
}

const GLYPHS: Record<string, (p: GlyphProps) => ReactElement> = {
  cash: Cash,
  card: Card,
  qr: Qr,
  visa: Visa,
  mastercard: Mastercard,
  jcb: Jcb,
  unionpay: UnionPay,
  amex: Amex,
};

export function AccountGlyph({ icon, size = 24 }: { icon: string; size?: number }) {
  const Glyph = GLYPHS[icon] ?? GLYPHS[FALLBACK_ICON];
  return <Glyph size={size} />;
}
