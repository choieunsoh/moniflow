'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { FALLBACK_EMOJI } from '@features/categories/queries';
import type { IconSet } from '@features/settings/queries';
import { formatBaht, formatBahtWhole } from '@shared/money';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { withSaveToast } from '@shared/ui/with-save-toast';
import { archiveRuleAction } from '../actions';
import type { RuleMeta } from '../queries';
import type { RuleView } from '../use-recurring';
import { RuleForm } from './RuleForm';

// 1st/2nd/3rd/4th…, correct for the 1–31 day-of-month range this renders (11th/12th/13th are the
// only irregular cases; 21st/22nd/23rd/31st fall out of the n % 10 switch).
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function amountLabel(rule: RuleView): string {
  return rule.currency === null || rule.currency === 'THB'
    ? formatBaht(rule.amount)
    : `${rule.currency} ${rule.amount}`;
}

async function archive(rule: RuleView): Promise<void> {
  const fd = new FormData();
  fd.set('id', String(rule.id));
  await withSaveToast(archiveRuleAction, 'Rule archived')(fd);
}

export type RecurringListProps = {
  rules: RuleView[];
  monthlyTotal: number;
  metaById: Record<number, RuleMeta>;
  categoryNames: string[];
  accountNames: string[];
  iconSet: IconSet;
};

// The /recurring page's body: the committed-per-month header, one row per standing rule, and the
// add/edit/archive flows. A single RuleForm dialog is shared across "add" and every row's "edit"
// (like CategoryPickerDialog) rather than one dialog per row.
export function RecurringList({
  rules,
  monthlyTotal,
  metaById,
  categoryNames,
  accountNames,
  iconSet,
}: RecurringListProps) {
  const [editing, setEditing] = useState<RuleView | 'new' | null>(null);
  const [archiving, setArchiving] = useState<RuleView | null>(null);

  const formRule = editing === 'new' || editing === null ? null : editing;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Recurring</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Standing rules that post themselves — subscriptions, bills, installments.
        </p>
      </header>

      <section className="panel flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>
            Committed
          </span>
          <span className="tnum text-xl font-semibold">
            {formatBahtWhole(monthlyTotal)} <span className="text-sm font-normal">/ month</span>
          </span>
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Rules</h2>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="tap inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 text-sm font-medium"
            style={{ color: 'var(--color-accent)' }}
          >
            <Plus size={18} aria-hidden />
            Add rule
          </button>
        </div>

        {rules.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
            No recurring rules yet — add a subscription, bill, or installment above.
          </p>
        ) : (
          <ul className="flex flex-col">
            {rules.map((rule) => {
              const meta = metaById[rule.id];
              return (
                <li key={rule.id} className="flex flex-col gap-2 border-b py-3 last:border-0">
                  <button
                    type="button"
                    onClick={() => setEditing(rule)}
                    className="tap flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <CategoryIcon
                      emoji={meta?.categoryEmoji ?? FALLBACK_EMOJI}
                      name={meta?.categoryName ?? ''}
                      hue={meta?.categoryHue ?? undefined}
                      iconSet={iconSet}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{rule.name}</span>
                      <span className="block text-xs" style={{ color: 'var(--color-faint)' }}>
                        {ordinal(rule.day)}
                        {rule.intervalMonths === 12 ? '/yr' : ''}
                        {rule.progress.total !== null &&
                          ` · ${rule.progress.paid} of ${rule.progress.total} paid · ${rule.progress.remaining} left`}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-sm font-medium">{amountLabel(rule)}</span>
                  </button>
                  <div className="flex justify-end pl-10">
                    <button
                      type="button"
                      onClick={() => setArchiving(rule)}
                      aria-label={`Archive ${rule.name}`}
                      title={`Archive ${rule.name}`}
                      className="tap shrink-0 rounded-[var(--radius-sm)] px-2"
                      style={{ color: 'var(--color-faint)' }}
                    >
                      <Trash2 size={18} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <RuleForm
        open={editing !== null}
        rule={formRule}
        meta={formRule ? metaById[formRule.id] : undefined}
        categoryNames={categoryNames}
        accountNames={accountNames}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={archiving !== null}
        title="Archive this rule?"
        body={
          archiving
            ? `"${archiving.name}" will stop posting new entries. Past entries stay in your ledger, and you can un-archive it later.`
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
