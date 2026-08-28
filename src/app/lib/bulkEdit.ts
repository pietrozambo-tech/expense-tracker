import { generatesOn, occurrenceDueDate } from './recurrence';
import type { Category, RecurringRule, Transaction } from '../types';

/**
 * What Activity's selection mode does to the rows it has selected.
 *
 * Pure on purpose. The screen decides WHAT is selected; this decides what
 * happens to it, and the test battery can ask the second question without a
 * browser. Nothing here mutates its input: every function returns fresh
 * arrays, which is what makes a cancelled confirmation free and undo nothing
 * more than keeping the arrays we started with.
 */

/**
 * The per-rule date a "stop the schedules" delete would cut at: the EARLIEST
 * selected occurrence of that rule. Ending a chain later than that would leave
 * the occurrences between the two dates behind, which is the opposite of what
 * the user just asked for.
 */
function ruleCutoffs(rows: Transaction[], rules: RecurringRule[]): Map<string, string> {
  const cut = new Map<string, string>();
  for (const t of rows) {
    if (!t.recurrenceOf) continue;
    const rule = rules.find((r) => r.id === t.recurrenceOf);
    // generatesOn, not isActiveRule - see the note on the single-row delete in
    // App: a chain that ends in the FUTURE still produces occurrences, and
    // treating it as dead is how a deleted row came back on the next open.
    if (!rule || !generatesOn(rule, occurrenceDueDate(t, rule))) continue;
    const due = occurrenceDueDate(t, rule);
    const prev = cut.get(rule.id);
    if (!prev || due < prev) cut.set(rule.id, due);
  }
  return cut;
}

export interface BulkDeletePlan {
  /** The selected rows that actually exist, in ledger order. */
  rows: Transaction[];
  /** Of those, the ones a schedule would recreate - the rows that make the
   *  "just these / stop the schedules" question necessary. */
  recurring: Transaction[];
  /** Of those, the ones that also live on the household's server. */
  shared: Transaction[];
  /**
   * Rows NOT selected that "stop the schedules" would delete as well.
   *
   * Stopping a chain removes everything from the cut-off onwards, and on a
   * multi-row selection that reaches past what the user ticked. It is a fair
   * thing to offer and an unfair thing to do quietly, so the number is worked
   * out here and said out loud in the dialog.
   */
  collateral: number;
}

/** Everything the delete confirmation needs to know, before anything is asked. */
export function planBulkDelete(
  ids: Set<string>,
  expenses: Transaction[],
  rules: RecurringRule[],
): BulkDeletePlan {
  const rows = expenses.filter((e) => ids.has(e.id));
  const recurring = rows.filter((t) => {
    const rule = t.recurrenceOf ? rules.find((r) => r.id === t.recurrenceOf) : undefined;
    return !!rule && generatesOn(rule, occurrenceDueDate(t, rule));
  });
  const shared = rows.filter((t) => !!t.split);

  const cut = ruleCutoffs(rows, rules);
  let collateral = 0;
  for (const e of expenses) {
    if (ids.has(e.id) || !e.recurrenceOf) continue;
    const from = cut.get(e.recurrenceOf);
    if (!from) continue;
    const rule = rules.find((r) => r.id === e.recurrenceOf);
    if (rule && occurrenceDueDate(e, rule) >= from) collateral += 1;
  }

  return { rows, recurring, shared, collateral };
}

/**
 * Delete the selection.
 *
 * `scope` answers the recurring question once for the whole batch - asking it
 * per row is not an option when eleven of them repeat.
 *
 *  - 'one'    the selected occurrences go, and each rule remembers the date so
 *             the engine does not recreate them. The schedules keep running.
 *  - 'future' each involved rule is ended at its earliest selected occurrence,
 *             and every occurrence of that rule from there on goes too. That
 *             is `collateral` in the plan above, and the dialog names it.
 */
export function applyBulkDelete(
  expenses: Transaction[],
  rules: RecurringRule[],
  ids: Set<string>,
  scope: 'one' | 'future',
  stamp = new Date().toISOString(),
): { expenses: Transaction[]; rules: RecurringRule[] } {
  const rows = expenses.filter((e) => ids.has(e.id));

  if (scope === 'one') {
    const skips = new Map<string, string[]>();
    for (const t of rows) {
      if (!t.recurrenceOf) continue;
      const rule = rules.find((r) => r.id === t.recurrenceOf);
      if (!rule || !generatesOn(rule, occurrenceDueDate(t, rule))) continue;
      // Only the engine's own output regenerates. A row the user typed and
      // the engine later adopted is theirs; deleting it records nothing,
      // exactly as the single-row path has it.
      if (!t.id.startsWith(`rec-${rule.id}-`)) continue;
      const list = skips.get(rule.id) ?? [];
      list.push(occurrenceDueDate(t, rule));
      skips.set(rule.id, list);
    }
    return {
      expenses: expenses.filter((e) => !ids.has(e.id)),
      // Stamped: a skip is an edit of the rule, and the stamp is what lets a
      // sync merge see this copy as the newer one instead of letting a stale
      // device un-remember the deletion.
      rules: rules.map((r) =>
        skips.has(r.id)
          ? { ...r, skipDates: [...(r.skipDates ?? []), ...skips.get(r.id)!], updatedAt: stamp }
          : r,
      ),
    };
  }

  const cut = ruleCutoffs(rows, rules);
  return {
    expenses: expenses.filter((e) => {
      if (ids.has(e.id)) return false;
      if (!e.recurrenceOf) return true;
      const from = cut.get(e.recurrenceOf);
      if (!from) return true;
      const rule = rules.find((r) => r.id === e.recurrenceOf);
      return !rule || occurrenceDueDate(e, rule) < from;
    }),
    rules: rules.map((r) => (cut.has(r.id) ? { ...r, endedAt: cut.get(r.id)!, updatedAt: stamp } : r)),
  };
}

/**
 * File the selection under a category, and optionally one of its subcategories.
 *
 * The type guard is not decoration. Categories are two separate lists, and an
 * income row wearing an expense category would be counted as spending by every
 * total in the app while still rendering green. The screen only offers this on
 * a single-type selection; this makes sure of it anyway.
 *
 * A subcategory belongs to the category above it, so the old one is dropped
 * rather than carried across - "Hotel" under Groceries is not a smaller error
 * than no subcategory at all.
 */
export function applyBulkCategory(
  expenses: Transaction[],
  ids: Set<string>,
  category: Category,
  subcategory: string | null,
  stamp = new Date().toISOString(),
): Transaction[] {
  return expenses.map((e) =>
    ids.has(e.id) && e.type === category.type
      ? { ...e, category, subcategory: subcategory ?? undefined, updatedAt: stamp }
      : e,
  );
}

/**
 * Put the selection on an account.
 *
 * The common case is an import: the AI cannot know how you paid, so a whole
 * trip lands with no account at all and fixing it one row at a time is the
 * chore this exists to remove.
 */
export function applyBulkSource(
  expenses: Transaction[],
  ids: Set<string>,
  sourceId: string,
  stamp = new Date().toISOString(),
): Transaction[] {
  return expenses.map((e) => (ids.has(e.id) ? { ...e, sourceId, updatedAt: stamp } : e));
}
