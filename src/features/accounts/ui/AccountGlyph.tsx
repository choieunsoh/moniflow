import type { ReactElement } from 'react';
import { FALLBACK_ICON } from '../queries';

// A payment-network glyph resolved from an icon KEY (the divergence from categories, which store a free
// emoji). Generics use currentColor; brand marks carry their own colors. Unknown keys fall back to the
// generic card. Pure/presentational — no hooks. `viewBox` is a 24-unit square for every glyph so `size`
// scales them uniformly.
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

function Visa({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="5" width="22" height="14" rx="2" fill="#1a1f71" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="700"
        fontStyle="italic"
        fontFamily="Arial, sans-serif"
        fill="#ffffff"
        letterSpacing="0.5"
      >
        VISA
      </text>
    </svg>
  );
}

function Mastercard({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="9.5" cy="12" r="6" fill="#eb001b" />
      <circle cx="14.5" cy="12" r="6" fill="#f79e1b" />
      <path d="M12 7.2a6 6 0 0 0 0 9.6 6 6 0 0 0 0-9.6Z" fill="#ff5f00" />
    </svg>
  );
}

function Jcb({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="5.5" height="12" rx="2" fill="#0e4c96" />
      <rect x="9.25" y="6" width="5.5" height="12" rx="2" fill="#d81e05" />
      <rect x="15.5" y="6" width="5.5" height="12" rx="2" fill="#00a05a" />
    </svg>
  );
}

function UnionPay({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="7" height="12" rx="2" fill="#e21836" />
      <rect x="8.5" y="6" width="7" height="12" rx="2" fill="#00447c" />
      <rect x="14" y="6" width="7" height="12" rx="2" fill="#007b84" />
    </svg>
  );
}

function Amex({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="5" width="22" height="14" rx="2" fill="#2e77bc" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="5.2"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        fill="#ffffff"
        letterSpacing="0.3"
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
