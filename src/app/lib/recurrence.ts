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

/**
 * Would the engine still create this rule's occurrence on this date?
 *
 * NOT isActiveRule. That one answers "is this the live chain to edit", and a
 * chain whose `endedAt` is still ahead of us fails it while the engine goes on
 * creating occurrences right up to that date - `endedAt` is exclusive. Asking
 * the wrong one of these two questions is how deleting an occurrence stopped
 * recording a skip, and the row came back on the next open, forever.
 */
export const generatesOn = (rule: RecurringRule, dateStr: string) =>
  !rule.endedAt || dateStr < rule.endedAt;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Is this transaction already the occurrence a rule would create on its date?
 *
 * Hard signals first: it has to be the same day, the same direction and the
 * same category. On top of that either the wording matches or the amount is in
 * the same neighbourhood - either alone is enough, because a bank writes
 * "Affitto" where the series says "Monthly rent", and a rent rises without
 * becoming a different bill.
 *
 * A row already owned by ANOTHER series is never a match: two schedules can
 * legitimately fall on the same day in the same category.
 */
function coversOccurrence(t: Transaction, rule: RecurringRule): boolean {
  if (t.recurrenceOf === rule.id) return true;
  if (t.recurrenceOf) return false;
  if ((t.type ?? 'expense') !== (rule.template.type ?? 'expense')) return false;
  if (t.category?.id !== rule.template.category?.id) return false;
  const amount = rule.template.amount || 0;
  const near = amount > 0 && Math.abs(t.amount - amount) / amount <= 0.35;
  return near || norm(t.description) === norm(rule.template.description ?? '');
}

/**
 * Occurrences the app generated that landed on top of a transaction the user
 * already had - the damage the guard above now prevents, found in data that
 * predates it. Only ever the GENERATED row is returned: the user's own copy
 * carries the real amount and is never a candidate for removal.
 */
export function findGeneratedDuplicates(
  transactions: Transaction[],
  rules: RecurringRule[],
): Array<{ generated: Transaction; kept: Transaction }> {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const byDate = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const slot = byDate.get(t.date);
    if (slot) slot.push(t);
    else byDate.set(t.date, [t]);
  }

  const out: Array<{ generated: Transaction; kept: Transaction }> = [];
  for (const t of transactions) {
    // Generated by the engine, which is exactly what its id encodes.
    if (!t.recurrenceOf || !t.id.startsWith(`rec-${t.recurrenceOf}-`)) continue;
    const rule = byId.get(t.recurrenceOf);
    if (!rule) continue;
    const kept = (byDate.get(t.date) ?? []).find((other) => other.id !== t.id && coversOccurrence(other, rule));
    if (kept) out.push({ generated: t, kept });
  }
  return out;
}

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

  // --- Enforcement: a skipDate is a deletion, not a suggestion.
  //
  // Skipping a date used to stop the engine CREATING that occurrence, and
  // nothing more. That is only half a deletion. A copy of the deleted row can
  // arrive from outside the engine - a stale device merging without a sync
  // base re-uploads whatever it still holds - and once it exists again, no
  // amount of "don't create it" removes it. A real ledger looped exactly
  // that way: delete the fee on the phone, a PC resurrects it into the cloud,
  // the phone pulls it back, forever.
  //
  // So the engine now deletes what the skip list says is deleted, every open,
  // on every device. Only rows the engine itself minted (`rec-<ruleId>-`) are
  // eligible: they are reproducible artifacts, so removing one can never lose
  // user-entered data - a manual transaction or a back-tagged imported row on
  // the same date has a different id shape and is untouchable here.
  {
    const skipsByRule = new Map(
      nextRules.filter((r) => r.skipDates?.length).map((r) => [r.id, new Set(r.skipDates)]),
    );
    if (skipsByRule.size > 0) {
      const kept = txns.filter((t) => {
        if (!t.recurrenceOf) return true;
        const skips = skipsByRule.get(t.recurrenceOf);
        if (!skips) return true;
        const prefix = `rec-${t.recurrenceOf}-`;
        return !(t.id.startsWith(prefix) && skips.has(t.id.slice(prefix.length)));
      });
      if (kept.length !== txns.length) {
        txns = kept;
        txnsChanged = true;
      }
    }
  }

  // --- Materialization.
  const existingIds = new Set(txns.map((t) => t.id));
  // What the ledger already holds on each day. The engine used to ask only
  // "did I create this occurrence before?", which is not the same question as
  // "does this transaction already exist". A rule anchored before imported
  // history - marking an older transaction as recurring does exactly that -
  // back-filled every month since, landing a generated copy on top of every
  // real row the import had already brought in.
  const byDate = new Map<string, Transaction[]>();
  for (const t of txns) {
    const slot = byDate.get(t.date);
    if (slot) slot.push(t);
    else byDate.set(t.date, [t]);
  }

  const createdTxns: Transaction[] = [];
  for (const rule of nextRules) {
    const skip = new Set(rule.skipDates ?? []);
    for (const dateStr of dueDatesSince(rule.anchorDate, rule.rule, today)) {
      if (!generatesOn(rule, dateStr)) continue;
      if (skip.has(dateStr)) continue;
      const id = `rec-${rule.id}-${dateStr}`;
      if (existingIds.has(id)) continue;
      // Never invent a row the user already has. Skipping is re-evaluated on
      // every pass, so deleting the row they kept brings the occurrence back.
      if ((byDate.get(dateStr) ?? []).some((t) => coversOccurrence(t, rule))) continue;
      existingIds.add(id);
      const made: Transaction = {
        id,
        date: dateStr,
        recurrence: rule.rule,
        recurrenceOf: rule.id,
        ...rule.template,
        // Lock the FX value at the day the occurrence is created, like any
        // other transaction saved on that day.
        baseAmount: convertAmount(rule.template.amount, rule.template.currency, BASE_CURRENCY),
      };
      createdTxns.push(made);
      const slot = byDate.get(dateStr);
      if (slot) slot.push(made);
      else byDate.set(dateStr, [made]);
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

/**
 * Earlier one-off copies of a series the user has just declared recurring:
 * same name (case and spacing aside), same category and direction, dated
 * before the seed, and not already part of any chain. Imported history is the
 * whole point - a year of "Monthly rent" rows arrives as plain one-offs, and
 * retagging them by hand is a dozen edits nobody will do.
 *
 * Amount deliberately does not matter: rents rise and plans change, but the
 * name on the transaction is the series.
 */

/** A plain one-off that looks like a member of the series: same name (case
 *  and spacing aside), same category and direction, dated before the cutoff,
 *  not already in any chain. */
const isUnclaimedMatch = (
  t: Transaction,
  name: string,
  categoryId: string | undefined,
  type: string,
  before: string,
) =>
  t.date < before &&
  !t.recurrenceOf &&
  (!t.recurrence || t.recurrence === 'Never repeat') &&
  (t.type ?? 'expense') === type &&
  t.category?.id === categoryId &&
  norm(t.description) === name;

export function findPastSeriesMatches(
  transactions: Transaction[],
  seed: { id: string; description: string; category: { id: string }; type?: string; date: string },
): Transaction[] {
  const name = norm(seed.description);
  if (!name) return [];
  return transactions.filter(
    (t) => t.id !== seed.id && isUnclaimedMatch(t, name, seed.category?.id, seed.type ?? 'expense', seed.date),
  );
}

/**
 * The other way round: given the rules that already exist, which plain
 * one-offs look like their history? The case findPastSeriesMatches cannot
 * reach - the series was set up long ago, so the "declare it recurring"
 * moment never comes again, while an import has just dropped a year of
 * untagged copies behind it.
 *
 * Only rows dated BEFORE the rule's anchor. The engine materializes from the
 * anchor forward, so everything offered here is history it will never touch:
 * tagging these creates no rule and no future occurrence, it only marks the
 * past as what it was. A same-named one-off AFTER the anchor is deliberately
 * left alone - next to a materialized occurrence it may well be a duplicate,
 * and sweeping it into the chain would hide that rather than fix it.
 */
export interface SeriesClaim {
  rule: RecurringRule;
  /** The wording the historical rows share, as they are worded. */
  label: string;
  rows: Transaction[];
  /** Same wording as the series, or matched on shape alone. */
  confidence: 'exact' | 'likely';
  /** The typical amount of the historical rows, for the review sheet. */
  medianAmount: number;
}

const monthKey = (date: string) => date.slice(0, 7);
const middle = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Cadences whose history should look like one row per month. */
const MONTHLY_RULES = new Set(['Every month', 'First day of the month']);

export function findUnclaimedSeriesRows(
  transactions: Transaction[],
  rules: RecurringRule[],
): SeriesClaim[] {
  const active = rules.filter(isActiveRule);
  if (active.length === 0) return [];

  // Cluster the unclaimed rows by what they are: direction, category, and the
  // exact wording. Wording groups the cluster; it is deliberately NOT how the
  // cluster is matched to a series - "Affitto" and "Monthly rent" are the same
  // bill, and no dictionary of translations would ever cover enough of them.
  const clusters = new Map<string, { type: string; categoryId: string | undefined; label: string; rows: Transaction[] }>();
  for (const t of transactions) {
    if (t.recurrenceOf) continue;
    if (t.recurrence && t.recurrence !== 'Never repeat') continue;
    const name = norm(t.description);
    if (!name) continue;
    const type = t.type ?? 'expense';
    const key = `${type}|${t.category?.id ?? ''}|${name}`;
    const found = clusters.get(key);
    if (found) found.rows.push(t);
    else clusters.set(key, { type, categoryId: t.category?.id, label: t.description.trim(), rows: [t] });
  }

  const claims: SeriesClaim[] = [];
  for (const cluster of clusters.values()) {
    const clusterName = norm(cluster.label);
    let best: { rule: RecurringRule; rows: Transaction[]; confidence: 'exact' | 'likely'; distance: number } | null = null;

    for (const rule of active) {
      if ((rule.template.type ?? 'expense') !== cluster.type) continue;
      if (rule.template.category?.id !== cluster.categoryId) continue;
      // Only history: the engine materializes from the anchor forward, so
      // anything before it is a row the engine will never touch. Tagging
      // these creates no rule and no future occurrence.
      const rows = cluster.rows.filter((t) => t.date < rule.anchorDate);
      if (rows.length === 0) continue;

      const exact = clusterName === norm(rule.template.description ?? '');
      const amount = middle(rows.map((r) => r.amount));
      const ruleAmount = rule.template.amount || 0;
      const distance = ruleAmount > 0 ? Math.abs(amount - ruleAmount) / ruleAmount : 1;

      let confidence: 'exact' | 'likely' | null = exact ? 'exact' : null;
      if (!confidence && MONTHLY_RULES.has(rule.rule)) {
        // Differently worded, so the shape has to carry the claim: a bill
        // that actually repeated (three or more rows, in three or more
        // different months) for an amount in the same neighbourhood as the
        // series. Loose on the amount because rents rise and plans change;
        // strict on the repetition, because a one-off cannot be a series.
        const months = new Set(rows.map((r) => monthKey(r.date)));
        if (rows.length >= 3 && months.size >= 3 && distance <= 0.35) confidence = 'likely';
      }
      if (!confidence) continue;

      // One cluster belongs to at most one series: an exact wording wins, and
      // among shape matches the nearest amount does.
      const better =
        !best ||
        (confidence === 'exact' && best.confidence !== 'exact') ||
        (confidence === best.confidence && distance < best.distance);
      if (better) best = { rule, rows, confidence, distance };
    }

    if (best) {
      claims.push({
        rule: best.rule,
        label: cluster.label,
        rows: best.rows,
        confidence: best.confidence,
        medianAmount: middle(best.rows.map((r) => r.amount)),
      });
    }
  }

  // Surest first, then biggest: the sheet reads top-down in order of how much
  // it is asking the user to take on trust.
  return claims.sort((a, b) =>
    a.confidence === b.confidence ? b.rows.length - a.rows.length : a.confidence === 'exact' ? -1 : 1,
  );
}

/**
 * Stamp past matches as members of an existing chain. recurrenceOf must point
 * at the real rule: a bare label with no chain link is a legacy seed, and the
 * migration at the top of processRecurrence would mint a brand-new rule out
 * of EACH row - a dozen rent rules, each materializing its own occurrences.
 * Linked to the rule they are just history: their dates sit before the
 * anchor, so the engine never touches them.
 */
export function tagPastSeries(
  transactions: Transaction[],
  matchIds: string[],
  rule: RecurringRule,
): Transaction[] {
  const ids = new Set(matchIds);
  const stamp = new Date().toISOString();
  return transactions.map((t) =>
    ids.has(t.id) ? { ...t, recurrence: rule.rule, recurrenceOf: rule.id, updatedAt: stamp } : t,
  );
}

// ── Looking forward ─────────────────────────────────────────────────────────

/**
 * The next `count` due dates for a rule, strictly after `today`.
 *
 * The mirror of dueDatesSince, which stops at today because the engine never
 * materializes ahead of time. Nothing here is written anywhere: an upcoming
 * occurrence is a projection of the rule, not a row, which is what keeps the
 * Scheduled screen from disagreeing with Activity and the Dashboard. A future
 * transaction would be counted by every total in the app for a month that has
 * not happened.
 *
 * Walks the cadence forward from the anchor rather than reusing dueDatesSince
 * with a far-future `today`: a daily rule anchored years back would generate
 * thousands of past dates before reaching the ones we want.
 */
export function nextDueDates(rule: RecurringRule, today: Date, count = 3): string[] {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const seed = parseLocalDate(rule.anchorDate);
  const skips = new Set(rule.skipDates ?? []);
  const out: string[] = [];

  // `endedAt` is exclusive, and a rule stopped in the past has no future at all.
  const accept = (d: Date) => {
    const s = toDateStr(d);
    if (d <= from) return false;
    // Strictly after the anchor, exactly as dueDatesSince generates. Only bites
    // when the anchor itself is still ahead of us - a schedule starting more
    // than one period out - where the monthly and yearly walks would otherwise
    // hand back the anchor and announce a charge the engine never makes.
    if (d <= seed) return false;
    if (rule.endedAt && s >= rule.endedAt) return false;
    if (skips.has(s)) return false;
    out.push(s);
    return true;
  };
  const done = () => out.length >= count;
  // Enough headroom for a daily rule to walk from `from` to the dates wanted,
  // while staying bounded for a rule whose cadence never advances.
  const CAP = 4000;

  switch (rule.rule) {
    case 'Every day':
    case 'Every work day': {
      const d = new Date(Math.max(seed.getTime(), from.getTime()));
      for (let i = 0; i < CAP && !done(); i++) {
        d.setDate(d.getDate() + 1);
        if (rule.rule === 'Every work day' && (d.getDay() === 0 || d.getDay() === 6)) continue;
        accept(new Date(d));
      }
      break;
    }
    case 'Every week':
    case 'Every second week': {
      const step = rule.rule === 'Every week' ? 7 : 14;
      const d = new Date(seed);
      // Jump the whole-period gap in one step instead of walking it.
      if (d < from) {
        const periods = Math.floor((from.getTime() - d.getTime()) / (step * 86400000));
        d.setDate(d.getDate() + periods * step);
      }
      for (let i = 0; i < CAP && !done(); i++) {
        d.setDate(d.getDate() + step);
        accept(new Date(d));
      }
      break;
    }
    case 'First day of the month': {
      const d = new Date(Math.max(seed.getTime(), from.getTime()));
      d.setDate(1);
      for (let i = 0; i < CAP && !done(); i++) {
        d.setMonth(d.getMonth() + 1);
        accept(new Date(d));
      }
      break;
    }
    case 'Every month': {
      const anchorDay = seed.getDate();
      const start = seed > from ? seed : from;
      for (let k = 0; k < CAP && !done(); k++) {
        const y = start.getFullYear() + Math.floor((start.getMonth() + k) / 12);
        const m = (start.getMonth() + k) % 12;
        accept(new Date(y, m, Math.min(anchorDay, daysInMonth(y, m))));
      }
      break;
    }
    case 'Every year': {
      const anchorDay = seed.getDate();
      const startYear = Math.max(seed.getFullYear(), from.getFullYear());
      for (let k = 0; k < CAP && !done(); k++) {
        const y = startYear + k;
        accept(new Date(y, seed.getMonth(), Math.min(anchorDay, daysInMonth(y, seed.getMonth()))));
      }
      break;
    }
    default:
      break; // 'Never repeat' or unknown: nothing is coming
  }
  return out.slice(0, count);
}

/** The single next occurrence, or null for a rule with no future left. */
export function nextDueDate(rule: RecurringRule, today: Date = new Date()): string | null {
  return nextDueDates(rule, today, 1)[0] ?? null;
}

/**
 * Schedules with a future left, ordered by what fires next.
 *
 * One place decides "what is scheduled", so the Settings screen and anything
 * that later wants the same answer cannot drift apart.
 *
 * Deliberately NOT filtered by isActiveRule. That flag answers "is this the
 * live chain to edit", and a rule whose `endedAt` is still ahead of us fails it
 * while the engine goes on creating occurrences right up to that date - which
 * is exactly what an edit dated a week out leaves behind: the current chain's
 * last charge, still pending. Hiding it would drop a transaction into Activity
 * that this screen never announced. A rule with nothing left projects to null
 * and falls out here on its own.
 */
export function upcomingSchedules(
  rules: RecurringRule[],
  today: Date = new Date(),
): Array<{ rule: RecurringRule; next: string; last: boolean }> {
  return rules
    .map((rule) => {
      // Two, so the row can say whether anything follows. A cut chain and its
      // replacement carry the same description, and "the last one at the old
      // amount" is the only thing that tells the pair apart on screen.
      const [next, after] = nextDueDates(rule, today, 2);
      return next ? { rule, next, last: !after } : null;
    })
    .filter((x): x is { rule: RecurringRule; next: string; last: boolean } => x !== null)
    .sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : 0));
}

/**
 * Rules that are still live yet will never fire again - so they can be seen.
 *
 * A rule the app itself created always has a future, and a rule the user ended
 * is finished and belongs to the past. What is left is a rule carrying a
 * cadence neither the engine nor the projection recognises, which can only
 * arrive from outside: a hand-edited backup, or a record written by a version
 * that knew a cadence this one does not. It creates nothing, and without this
 * it would also be invisible - impossible to see, impossible to delete, and
 * synced forever.
 */
export function strandedRules(
  rules: RecurringRule[],
  today: Date = new Date(),
): RecurringRule[] {
  return rules.filter(
    (r) => !r.endedAt && r.rule !== 'Never repeat' && nextDueDate(r, today) === null,
  );
}

/**
 * The anchor to store so that `start` is the FIRST date the rule produces.
 *
 * Occurrences are generated strictly after the anchor, because normally the
 * anchor is the seed transaction's own date and that transaction IS the first
 * instance. A schedule created from Settings has no seed - the user picks a
 * start date and expects money to appear on it - so the anchor is backdated by
 * exactly one period, and the engine's first output lands on `start`.
 */
export function anchorForStart(start: string, rule: string): string {
  const d = parseLocalDate(start);
  switch (rule) {
    case 'Every day':
      d.setDate(d.getDate() - 1);
      break;
    case 'Every work day':
      // Back over the weekend, so Monday's anchor is the previous Friday.
      do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
      break;
    case 'Every week':
      d.setDate(d.getDate() - 7);
      break;
    case 'Every second week':
      d.setDate(d.getDate() - 14);
      break;
    case 'First day of the month':
    case 'Every month': {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
      break;
    }
    case 'Every year':
      d.setFullYear(d.getFullYear() - 1);
      break;
    default:
      break;
  }
  return toDateStr(d);
}
