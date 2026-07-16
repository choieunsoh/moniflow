'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { IconSet } from '@features/settings/queries';
import { formatBahtWhole } from '@shared/money';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { withSaveToast } from '@shared/ui/with-save-toast';
import { archiveRuleAction } from '../actions';
import type { RuleMeta } from '../queries';
import type { RuleView } from '../use-recurring';
import { RuleRow } from './RuleRow';

async function archive(rule: RuleView): Promise<void> {
  const fd = new FormData();
  fd.set('id', String(rule.id));
  await withSaveToast(archiveRuleAction, 'Rule archived')(fd);
}

export type RecurringListProps = {
  rules: RuleView[];
  monthlyTotal: number;
  metaById: Record<number, RuleMeta>;
  iconSet: IconSet;
};

type Section = { key: string; label: string; rules: RuleView[]; total: number; unit: string };

// Split by cadence, the way Records splits by day: each section is a real bucket with its own total,
// and a bucket with nothing in it doesn't render. Monthly leads because it is the common case.
//
// Each section states its total in ITS OWN unit, and says which. A yearly section normalised to a
// monthly contribution would sum tidily into the header — and would also tell you a ฿1,200/yr domain
// renewal costs ฿100, which is false. The header is the one place a per-month roll-up belongs; a
// section says what you actually pay and how often.
function sectionsOf(rules: RuleView[]): Section[] {
  const monthly = rules.filter((r) => r.intervalMonths !== 12);
  const yearly = rules.filter((r) => r.intervalMonths === 12);
  // monthlyThb is amortised, so a yearly rule's own outlay is that × 12.
  const sum = (rs: RuleView[], factor: number) => rs.reduce((t, r) => t + r.monthlyThb * factor, 0);
  return [
    { key: 'monthly', label: 'Monthly', rules: monthly, total: sum(monthly, 1), unit: '/ mo' },
    { key: 'yearly', label: 'Yearly', rules: yearly, total: sum(yearly, 12), unit: '/ yr' },
  ].filter((s) => s.rules.length > 0);
}

// The /recurring body, built to the Records page's vocabulary: a summary line, then cadence sections
// whose headers sit OUTSIDE the panel that holds their rows (a panel inside a panel is a nested card),
// then swipe rows. The header block Records doesn't have isn't here either — the More sheet already
// named this page on the way in.
export function RecurringList({ rules, monthlyTotal, metaById, iconSet }: RecurringListProps) {
  const [archiving, setArchiving] = useState<RuleView | null>(null);
  const sections = sectionsOf(rules);

  if (rules.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Nothing repeats yet. Add a subscription, a bill, or an installment and it will post
            itself on the day it is due.
          </p>
          <Link href="/recurring/new" className="btn btn-primary">
            Add a rule
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary of what is standing — count left, committed-per-month right, mirroring the Records
          summary line. This is the ONE per-month roll-up on the page: yearly rules amortised, foreign
          rules priced at their pinned rate or the cached one. The sections below each state their own
          unit instead, so no figure here has to be read twice. */}
      <div className="flex items-baseline justify-between px-1">
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="tnum text-sm font-semibold">{formatBahtWhole(monthlyTotal)}</span>
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            / month
          </span>
        </span>
      </div>

      {sections.map((section) => (
        // Native <details> = tap the header to collapse/expand, no JS — the same disclosure Records
        // uses for its day sections.
        <details open key={section.key} className="flex flex-col gap-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-1 [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-center gap-1.5">
              <Chevron />
              <h2 className="truncate text-sm font-semibold">{section.label}</h2>
              <span className="tnum shrink-0 text-sm" style={{ color: 'var(--color-muted)' }}>
                ({section.rules.length})
              </span>
            </div>
            <span className="flex shrink-0 items-baseline gap-1">
              <span className="tnum text-sm">{formatBahtWhole(section.total)}</span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {section.unit}
              </span>
            </span>
          </summary>
          <ul className="panel flex flex-col divide-y overflow-hidden">
            {section.rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                meta={metaById[rule.id]}
                iconSet={iconSet}
                onArchive={setArchiving}
              />
            ))}
          </ul>
        </details>
      ))}

      <Link href="/recurring/new" className="btn btn-ghost w-full">
        Add a rule
      </Link>

      <p className="px-1 text-center text-xs" style={{ color: 'var(--color-faint)' }}>
        Tap a rule to edit · swipe left to archive
      </p>

      <ConfirmDialog
        open={archiving !== null}
        title="Archive this rule?"
        body={
          archiving
            ? `"${archiving.name}" will stop posting new entries. Past entries stay in your ledger.`
            : ''
        }
        confirmLabel="Archive"
        destructive
        onConfirm={() => {
          if (archiving) void archive(archiving);
        }}
        onClose={() => setArchiving(null)}
      />
    </div>
  );
}

// A disclosure caret: points right when collapsed, rotates down when an ancestor <details> is open.
// Same glyph and rotation the Records sections use.
function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 transition-transform duration-150 [[open]_&]:rotate-90"
      style={{ color: 'var(--color-faint)' }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
