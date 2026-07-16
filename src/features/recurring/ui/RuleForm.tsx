'use client';

import { useEffect, useRef } from 'react';
import { CURRENCIES } from '@features/entries/entry-form';
import { toast } from '@shared/ui/toast';
import { addRuleAction, editRuleAction } from '../actions';
import type { RuleMeta } from '../queries';
import type { RuleView } from '../use-recurring';

const inputClass = 'min-h-11 w-full rounded-[var(--radius-sm)] border px-3 text-base tnum';
const inputStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' };
const labelClass = 'flex flex-col gap-1 text-sm';

// Merge the current rule's category/account name into the option list even if it's since been
// archived — otherwise editing a rule tied to an archived category would silently reassign it to
// whatever the <select> defaults to.
function optionsWith(names: string[], current: string | null | undefined): string[] {
  if (current === null || current === undefined || names.includes(current)) return names;
  return [current, ...names];
}

export type RuleFormProps = {
  open: boolean;
  rule: RuleView | null; // null = add mode
  meta: RuleMeta | undefined; // current category/account names — only known for an existing rule
  categoryNames: string[];
  accountNames: string[];
  onClose: () => void;
};

// Add/edit a recurring rule, as a controlled native <dialog> (same showModal()/close() wiring as
// ConfirmDialog/MoreSheet). Field `name`s match parseRuleForm's keys exactly (rule-form.ts) — a
// mismatch here would fail silently at runtime, not at compile time. Uncontrolled (defaultValue):
// the form remounts (via `key`) whenever it's pointed at a different rule, and resets on close.
export function RuleForm({
  open,
  rule,
  meta,
  categoryNames,
  accountNames,
  onClose,
}: RuleFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  function close(): void {
    formRef.current?.reset();
    onClose();
  }

  async function handleSubmit(formData: FormData): Promise<void> {
    try {
      if (rule) {
        formData.set('id', String(rule.id));
        await editRuleAction(formData);
        toast('Rule updated');
      } else {
        await addRuleAction(formData);
        toast('Rule added');
      }
      close();
    } catch (e) {
      // parseRuleForm's own message (e.g. "Amount must be greater than zero.") — not a generic
      // "couldn't save", so the user learns exactly which field to fix.
      toast.error(e instanceof Error ? e.message : 'Couldn’t save — try again');
    }
  }

  const categoryOptions = optionsWith(categoryNames, meta?.categoryName);
  const accountOptions = optionsWith(accountNames, meta?.accountName);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
    >
      <form
        ref={formRef}
        key={rule?.id ?? 'new'}
        action={handleSubmit}
        className="flex max-h-[80vh] flex-col gap-3 overflow-y-auto p-5"
      >
        <h2 className="text-base font-semibold">{rule ? 'Edit rule' : 'Add rule'}</h2>

        <label className={labelClass}>
          Name
          <input
            type="text"
            name="name"
            required
            defaultValue={rule?.name}
            className={inputClass}
            style={inputStyle}
          />
        </label>

        <label className={labelClass}>
          Category
          <select
            name="category"
            required
            defaultValue={meta?.categoryName ?? ''}
            className={inputClass}
            style={inputStyle}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Account
          <select
            name="account"
            required
            defaultValue={meta?.accountName ?? ''}
            className={inputClass}
            style={inputStyle}
          >
            <option value="" disabled>
              Choose an account
            </option>
            {accountOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <label className={`${labelClass} flex-1`}>
            Amount
            <input
              type="number"
              name="amount"
              inputMode="decimal"
              step="any"
              min="0"
              required
              defaultValue={rule?.amount}
              className={inputClass}
              style={inputStyle}
            />
          </label>
          <label className={`${labelClass} w-24`}>
            Currency
            <select
              name="currency"
              defaultValue={rule?.currency ?? 'THB'}
              className={inputClass}
              style={inputStyle}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass}>
          Pinned FX rate (optional — THB per unit; blank prices at the live rate on the due date)
          <input
            type="number"
            name="rate"
            inputMode="decimal"
            step="any"
            min="0"
            defaultValue={rule?.rate ?? ''}
            className={inputClass}
            style={inputStyle}
          />
        </label>

        <div className="flex gap-3">
          <label className={`${labelClass} flex-1`}>
            Day of month
            <input
              type="number"
              name="day"
              inputMode="numeric"
              min={1}
              max={31}
              required
              defaultValue={rule?.day ?? 1}
              className={inputClass}
              style={inputStyle}
            />
          </label>
          <label className={`${labelClass} flex-1`}>
            Cadence
            <select
              name="intervalMonths"
              defaultValue={rule?.intervalMonths ?? 1}
              className={inputClass}
              style={inputStyle}
            >
              <option value={1}>Monthly</option>
              <option value={12}>Yearly</option>
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          <label className={`${labelClass} flex-1`}>
            Total payments (optional — set for an installment)
            <input
              type="number"
              name="totalCount"
              inputMode="numeric"
              min={1}
              defaultValue={rule?.totalCount ?? ''}
              className={inputClass}
              style={inputStyle}
            />
          </label>
          <label className={`${labelClass} flex-1`}>
            Next payment # (optional)
            <input
              type="number"
              name="startSeq"
              inputMode="numeric"
              min={1}
              defaultValue={rule?.startSeq ?? ''}
              className={inputClass}
              style={inputStyle}
            />
          </label>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {rule ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
