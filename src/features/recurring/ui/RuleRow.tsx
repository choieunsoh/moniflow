'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PointerEvent } from 'react';
import { useRef, useState } from 'react';
import { formatBaht, formatCurrency } from '@shared/money';
import { resolveSwipe, type SwipeSide } from '@features/entries/swipe';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { FALLBACK_EMOJI } from '@features/categories/queries';
import type { IconSet } from '@features/settings/queries';
import type { RuleMeta } from '../queries';
import type { RuleView } from '../use-recurring';
import { ordinal } from '../ordinal';

// Width of the action panel revealed behind the row — matches SwipeRow.
const ACTION_W = 88;
// Movement (px) past which a gesture counts as a drag rather than a tap — matches SwipeRow.
const DRAG_SLOP = 6;

// A standing-rule row, built to the ledger row's gesture model: tap to edit, drag left to reveal
// Archive. A vertical drag stays a native scroll and never edits (`touch-action: pan-y`). Edit and
// Archive are real DOM controls behind the row, so both stay in the a11y tree for keyboard/AT even
// though editing is a tap.
//
// Archive, not Delete: a rule's posted entries are ordinary ledger rows and stay put, so removing a
// rule only stops FUTURE posts. It still carries the loss colour, because it is the terminal action
// on this surface and the swipe gesture promises the same thing everywhere in the app.
export function RuleRow({
  rule,
  meta,
  iconSet,
  onArchive,
}: {
  rule: RuleView;
  meta?: RuleMeta;
  iconSet: IconSet;
  onArchive: (rule: RuleView) => void;
}) {
  const [side, setSide] = useState<SwipeSide>(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    base: number;
    movedX: boolean;
    movedY: boolean;
  } | null>(null);
  const router = useRouter();

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      base: side * ACTION_W,
      movedX: false,
      movedY: false,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > DRAG_SLOP) g.movedX = true;
    if (Math.abs(dy) > DRAG_SLOP) g.movedY = true;
    setOffset(Math.max(-ACTION_W, Math.min(0, g.base + dx)));
  }

  function onPointerUp() {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setDragging(false);
    if (g.movedX) {
      const next = resolveSwipe(offset, ACTION_W);
      setSide(next);
      setOffset(next * ACTION_W);
      return;
    }
    if (g.movedY) {
      setOffset(side * ACTION_W);
      return;
    }
    if (side !== 0) {
      setSide(0);
      setOffset(0);
      return;
    }
    router.push(`/recurring/edit?id=${rule.id}`);
  }

  function onPointerCancel() {
    gesture.current = null;
    setDragging(false);
    setOffset(side * ACTION_W);
  }

  const translate = dragging ? offset : side * ACTION_W;
  // A foreign rule shows both figures the way a foreign ledger row does: what you are billed on top,
  // what it costs in baht beneath.
  const isForeign = rule.currency !== null && rule.currency !== 'THB';
  const progress = rule.progress;
  // The category leads the row and the rule name (which becomes the posted entry's note) sits on the
  // second line — the same hierarchy the ledger's SwipeRow uses, where the category is the headline
  // and the note is secondary. Fall back to the rule name as the headline only when a rule somehow
  // has no category, so the row is never blank; the note line is then suppressed to avoid repeating it.
  const categoryName = meta?.categoryName ?? '';
  const headline = categoryName || rule.name;
  const showNote = categoryName !== '';

  return (
    <li className="relative overflow-hidden">
      {/* Edit — tapping the row opens it; this control stays behind the row so keyboard/AT users keep
          a real, focusable edit affordance. */}
      <Link
        href={`/recurring/edit?id=${rule.id}`}
        aria-label={`Edit ${rule.name}`}
        onClick={() => setSide(0)}
        className="absolute inset-y-0 left-0 flex items-center justify-center"
        style={{
          width: ACTION_W,
          background: 'var(--color-accent)',
          color: 'var(--color-on-accent)',
        }}
      >
        <PencilIcon />
      </Link>

      {/* Archive — revealed on a left swipe. Confirm-gated by the list (unlike a ledger delete): this
          stops every future post, and there is no un-archive surface yet. */}
      <button
        type="button"
        onClick={() => {
          setSide(0);
          setOffset(0);
          onArchive(rule);
        }}
        aria-label={`Archive ${rule.name}`}
        className="absolute inset-y-0 right-0 flex items-center justify-center"
        style={{
          width: ACTION_W,
          background: 'var(--color-loss)',
          color: 'var(--color-on-accent)',
        }}
      >
        <ArchiveIcon />
      </button>

      {/* Foreground — the rule; opaque so it hides the actions when closed. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="relative flex cursor-pointer touch-pan-y flex-col gap-2 bg-[var(--color-surface)] px-4 py-3 select-none hover:bg-[var(--color-surface-2)]"
        style={{
          transform: `translateX(${translate}px)`,
          transition: dragging
            ? 'none'
            : 'transform var(--dur) var(--ease-out), background-color var(--dur) var(--ease-out)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <CategoryIcon
              emoji={meta?.categoryEmoji ?? FALLBACK_EMOJI}
              name={meta?.categoryName ?? ''}
              hue={meta?.categoryHue ?? undefined}
              iconSet={iconSet}
            />
            <span className="min-w-0 truncate text-sm font-medium">{headline}</span>
            {/* The day is the rule's defining fact — when it hits you. It reads as a chip because it
                is the same kind of metadata the ledger row chips carry. Only the day, never the
                month: the section header already says Monthly vs Yearly, so the month would be noise. */}
            <span className="chip tnum shrink-0">{ordinal(rule.day)}</span>
          </span>
          {isForeign ? (
            <span className="flex shrink-0 flex-col items-end">
              {/* formatCurrency, not formatForeign: a rule's amount is the figure you KEYED, so it
                  states its cents ($9.99). formatForeign rounds to whole, which is right for a trip's
                  rolled-up total and wrong for a price — it would quote this subscription at $10. */}
              <span
                className="tnum font-medium whitespace-nowrap"
                style={{ color: 'var(--color-loss)' }}
              >
                {formatCurrency(rule.amount, rule.currency ?? '')}
              </span>
              {/* What it costs in baht. A pinned rule states it flat; a live-rate rule is priced at
                  the cached rate and says so with ≈ — the same hedge the rule keypad shows, and it
                  needs no legend the way an asterisk would.
                  With no rate anywhere (nothing pinned, nothing cached) monthlyThb is 0, and "฿0.00"
                  would be a lie: the rule costs something, we just can't price it yet. Say that. */}
              <span
                className="tnum text-xs whitespace-nowrap"
                style={{ color: 'var(--color-muted)' }}
              >
                {rule.monthlyThb === 0
                  ? 'no rate yet'
                  : `${rule.rate === null ? '≈ ' : ''}${formatBaht(rule.monthlyThb * rule.intervalMonths)}`}
              </span>
            </span>
          ) : (
            <span
              className="tnum shrink-0 font-medium whitespace-nowrap"
              style={{ color: 'var(--color-loss)' }}
            >
              {formatBaht(rule.amount)}
            </span>
          )}
        </div>
        {/* Second line: the rule's name (its posted-entry note), then an installment's progress when
            there is one. The category now leads the row above, so this line carries what the headline
            no longer does. Cadence and day are the section header's and the chip's jobs, so they stay
            off this line, per SwipeRow's drop-what-the-header-said rule. */}
        {showNote || progress.total !== null ? (
          <div className="truncate text-sm" style={{ color: 'var(--color-muted)' }}>
            {showNote ? rule.name : ''}
            {showNote && progress.total !== null ? ' · ' : ''}
            {progress.total !== null ? (
              <span className="tnum">
                {progress.paid} of {progress.total} paid · {progress.remaining} left
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

// Action icons in the app's chrome-icon house style (inline SVG, stroke=currentColor → inherits the
// panel's on-accent white), matching SwipeRow rather than importing a second icon library.
function PencilIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10.5 3 13 5.5 M3 13v-2.2l7.3-7.3 2.2 2.2L5.2 13H3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 3.2h11v2.6h-11z M3.6 5.8h8.8V13H3.6z M6.4 8.4h3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
