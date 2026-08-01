import type { RecurringRule, Transaction } from '../types';
import { parseLocalDate } from './dates';
import { convertAmount, BASE_CURRENCY } from '../utils/currency';

// Materialization engine for recurring transactions.
//
// Schedules live in RecurringRule objects, decoupled from transaction history:
// the rule's template is what future occurrences are stamped from, so editing a
// past transaction never changes the schedule, and updating the schedule never
// rewrites history. Nothing is created ahead of time - each occurrence appears
// once its scheduled day arrives (or is back-filled on the next open).
//
// - Occurrence ids are deterministic (`rec-<ruleId>-<date>`), so re-running the
//   engine can never duplicate one, and the id keeps encoding the original due
//   date even if the user later edits the occurrence's date.
// - `skipDates` records individually deleted occurrences so they are not
//   regenerated; `endedAt` (exclusive) stops a chain from a date onward.
// - Legacy chains (from the earlier seed-based engine) are migrated in place:
//   a seed transaction carrying a rule becomes a RecurringRule with the same
//   chain id, so already-materialized occurrence ids keep matching.
// - Demo data never generates rules or occurrences.

const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

export const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// All due dates for `rule`, strictly after the anchor date, up to `today`.
// Capped defensively so a years-old daily rule cannot generate unbounded rows.
export function dueDatesSince(anchorDateStr: string, rule: string, today: Date, cap = 750): string[] {
  const seed = parseLocalDate(anchorDateStr);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // local midnight
  const out: string[] = [];

  const push = (d: Date) => {
    if (d > seed && d <= end) out.push(toDateStr(d));
  };

  switch (rule) {
    case 'Every day':
    case 'Every work day': {
      const d = new Date(seed);
      while (out.length < cap) {
        d.setDate(d.getDate() + 1);
        if (d > end) break;
        if (rule === 'Every work day' && (d.getDay() === 0 || d.getDay() === 6)) continue;
        out.push(toDateStr(d));
      }
      break;
    }
    case 'Every week':
    case 'Every second week': {
      const step = rule === 'Every week' ? 7 : 14;
      const d = new Date(seed);
      while (out.length < cap) {
        d.setDate(d.getDate() + step);
        if (d > end) break;
        out.push(toDateStr(d));
      }
      break;
    }
    case 'First day of the month': {
      const d = new Date(seed.getFullYear(), seed.getMonth() + 1, 1);
      while (out.length < cap && d <= end) {
        push(new Date(d));
        d.setMonth(d.getMonth() + 1);
      }
      break;
    }
    case 'Every month': {
      // Anchored to the anchor's day-of-month, clamped per month (the 31st
      // becomes Feb 28 but returns to the 31st in March).
      const anchorDay = seed.getDate();
      for (let k = 1; out.length < cap; k++) {
        const y = seed.getFullYear() + Math.floor((seed.getMonth() + k) / 12);
        const m = (seed.getMonth() + k) % 12;
        const d = new Date(y, m, Math.min(anchorDay, daysInMonth(y, m)));
        if (d > end) break;
        push(d);
      }
      break;
    }
    case 'Every year': {
      const anchorDay = seed.getDate();
      for (let k = 1; out.length < cap; k++) {
        const y = seed.getFullYear() + k;
        const d = new Date(y, seed.getMonth(), Math.min(anchorDay, daysInMonth(y, seed.getMonth())));
        if (d > end) break;
        push(d);
      }
      break;
    }
    default:
      break; // 'Never repeat' or unknown
  }
  return out;
}

export const isActiveRule = (r: RecurringRule) => !r.endedAt;

export function buildRuleTemplate(t: Transaction): RecurringRule['template'] {
  return {
    description: t.description,
    amount: t.amount,
    currency: t.currency,
    category: t.category,
    subcategory: t.subcategory,
    sourceId: t.sourceId,
    type: t.type,
  };
}

export function newRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// One pass over the data: migrate legacy seed-based chains into rules, then
// materialize every occurrence that is due. Pure - returns new arrays (or the
// original references when nothing changed).
export function processRecurrence(
  transactions: Transaction[],
  rules: RecurringRule[],
  today: Date = new Date(),
): {
  transactions: Transaction[];
  rules: RecurringRule[];
  txnsChanged: boolean;
  rulesChanged: boolean;
  createdCount: number;
} {
  let txns = transactions;
  let nextRules = rules;
  let txnsChanged = false;
  let rulesChanged = false;

  // --- Migration: legacy seeds (recurrence label, no chain link) become rules.
  // The rule id reuses the seed's id so occurrence ids from the old engine
  // (`rec-<seedId>-<date>`) keep matching and are not regenerated.
  const legacySeeds = txns.filter(
    (t) =>
      t.recurrence &&
      t.recurrence !== 'Never repeat' &&
      !t.recurrenceOf &&
      !t.id.startsWith('demo-'),
  );
  if (legacySeeds.length > 0) {
    const existingRuleIds = new Set(nextRules.map((r) => r.id));
    const created: RecurringRule[] = [];
    for (const seed of legacySeeds) {
      if (!existingRuleIds.has(seed.id)) {
        created.push({
          id: seed.id,
          rule: seed.recurrence!,
          anchorDate: seed.date,
          template: buildRuleTemplate(seed),
        });
      }
    }
    if (created.length > 0) {
      nextRules = [...nextRules, ...created];
      rulesChanged = true;
    }
    const seedIds = new Set(legacySeeds.map((s) => s.id));
    txns = txns.map((t) => (seedIds.has(t.id) ? { ...t, recurrenceOf: t.id } : t));
    txnsChanged = true;
  }

  // --- Materialization.
  const existingIds = new Set(txns.map((t) => t.id));
  const createdTxns: Transaction[] = [];
  for (const rule of nextRules) {
    const skip = new Set(rule.skipDates ?? []);
    for (const dateStr of dueDatesSince(rule.anchorDate, rule.rule, today)) {
      if (rule.endedAt && dateStr >= rule.endedAt) continue;
      if (skip.has(dateStr)) continue;
      const id = `rec-${rule.id}-${dateStr}`;
      if (existingIds.has(id)) continue;
      existingIds.add(id);
      createdTxns.push({
        id,
        date: dateStr,
        recurrence: rule.rule,
        recurrenceOf: rule.id,
        ...rule.template,
        // Lock the FX value at the day the occurrence is created, like any
        // other transaction saved on that day.
        baseAmount: convertAmount(rule.template.amount, rule.template.currency, BASE_CURRENCY),
      });
    }
  }
  if (createdTxns.length > 0) {
    txns = [...createdTxns, ...txns];
    txnsChanged = true;
  }

  return {
    transactions: txns,
    rules: nextRules,
    txnsChanged,
    rulesChanged,
    createdCount: createdTxns.length,
  };
}

// The original due date of an occurrence (encoded in its id), used for
// skip/ended bookkeeping even if the user has edited the visible date since.
export function occurrenceDueDate(t: Transaction, rule: RecurringRule): string {
  const prefix = `rec-${rule.id}-`;
  return t.id.startsWith(prefix) ? t.id.slice(prefix.length) : t.date;
}

/**
 * "This and future ones": end the old chain at this occurrence, start a new
 * rule from the edited values, and move any already-materialized later
 * occurrences onto it. Past occurrences are untouched. Pure, so the engine and
 * this can be tested against each other - the bug it exists to prevent only
 * showed up on the NEXT materialization pass, not at the edit.
 */
export function applyFutureEdit(
  transactions: Transaction[],
  rules: RecurringRule[],
  current: Transaction,
  rule: RecurringRule,
  values: Partial<Transaction>,
  nextRuleId: string = newRuleId(),
): { transactions: Transaction[]; rules: RecurringRule[] } {
  const cutoff = occurrenceDueDate(current, rule);
  const stopping = values.recurrence === 'Never repeat';

  // Occurrences the user had already deleted past this point stay deleted:
  // without carrying them over, ending one chain and starting another quietly
  // brings every one of them back.
  const carriedSkips = (rule.skipDates ?? []).filter((d) => d > cutoff);

  const nextRule: RecurringRule | null = stopping
    ? null
    : {
        id: nextRuleId,
        rule: values.recurrence!,
        anchorDate: values.date!,
        template: buildRuleTemplate(values as Transaction),
        ...(carriedSkips.length ? { skipDates: carriedSkips } : {}),
      };

  const nextRules = [
    ...rules.map((r) => (r.id === rule.id ? { ...r, endedAt: cutoff } : r)),
    ...(nextRule ? [nextRule] : []),
  ];

  const isLaterInChain = (e: Transaction) =>
    e.id !== current.id && e.recurrenceOf === rule.id && occurrenceDueDate(e, rule) > cutoff;

  if (stopping) {
    // Stopping the schedule from here on also removes the auto-created later
    // occurrences - the user just said they shouldn't exist.
    return {
      rules: nextRules,
      transactions: transactions
        .filter((e) => !isLaterInChain(e))
        .map((e) => (e.id === current.id ? { ...e, ...values, recurrenceOf: undefined } : e)),
    };
  }

  return {
    rules: nextRules,
    transactions: transactions.map((e) => {
      if (e.id === current.id) return { ...e, ...values, recurrenceOf: nextRule!.id };
      if (!isLaterInChain(e)) return e;
      const due = occurrenceDueDate(e, rule);
      return {
        ...e,
        // Re-key onto the new chain. An occurrence's id encodes the rule that
        // owns it, and that id is exactly the engine's "already materialized?"
        // check. Left under the old rule's id these were invisible to the new
        // rule, which materialized every one of them a second time - a
        // duplicate per future occurrence, appearing on the next app open
        // rather than at the edit, so the two never looked connected.
        id: e.id.startsWith(`rec-${rule.id}-`) ? `rec-${nextRule!.id}-${due}` : e.id,
        ...buildRuleTemplate(values as Transaction),
        recurrence: values.recurrence,
        recurrenceOf: nextRule!.id,
        baseAmount: convertAmount(values.amount!, values.currency!, BASE_CURRENCY),
        // These rows just changed; without a fresh stamp another device's
        // untouched copy would look newer and undo the edit.
        updatedAt: values.updatedAt ?? e.updatedAt,
      };
    }),
  };
}
