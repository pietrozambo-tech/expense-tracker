import type { Transaction } from '../types';
import { parseLocalDate } from './dates';
import { convertAmount, BASE_CURRENCY } from '../utils/currency';

// Materialization engine for recurring transactions.
//
// A transaction saved with a recurrence rule is the SEED of a chain. Nothing is
// created ahead of time: each occurrence appears only once its scheduled day
// arrives (running the engine on app open / foregrounding also back-fills any
// occurrences missed while the app was closed).
//
// Semantics:
// - Occurrences are clones of the seed's *current* values, so editing the seed
//   (e.g. the rent goes up) changes future occurrences, never past ones.
// - Clones carry `recurrenceOf: seed.id`; only seeds (no recurrenceOf) generate.
// - Deleting the seed stops the chain; already-created occurrences remain.
// - Clone ids are deterministic (`rec-<seedId>-<date>`), so re-running the
//   engine can never duplicate an occurrence.
// - Monthly/yearly schedules are anchored to the seed's day-of-month: the 31st
//   clamps to a short month's last day but returns to the 31st afterwards.
// - Demo data is skipped: its chains would outlive "Erase demo data".

const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// All due dates for `rule`, strictly after the seed date, up to `today`.
// Capped defensively so a years-old daily seed cannot generate unbounded rows.
export function dueDatesSince(seedDateStr: string, rule: string, today: Date, cap = 750): string[] {
  const seed = parseLocalDate(seedDateStr);
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
      // Anchored to the seed's day-of-month, clamped per month.
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

// Returns the occurrences that are due but missing. Pure - the caller decides
// how to merge/persist them.
export function materializeRecurring(transactions: Transaction[], today: Date = new Date()): Transaction[] {
  const seeds = transactions.filter(
    (t) =>
      t.recurrence &&
      t.recurrence !== 'Never repeat' &&
      !t.recurrenceOf &&
      !t.id.startsWith('demo-'),
  );
  if (seeds.length === 0) return [];

  const created: Transaction[] = [];
  const existingIds = new Set(transactions.map((t) => t.id));

  for (const seed of seeds) {
    for (const dateStr of dueDatesSince(seed.date, seed.recurrence!, today)) {
      const id = `rec-${seed.id}-${dateStr}`;
      if (existingIds.has(id)) continue; // already materialized
      existingIds.add(id);
      created.push({
        ...seed,
        id,
        date: dateStr,
        recurrenceOf: seed.id,
        // Lock the FX value at the day the occurrence is created, like any
        // other transaction saved on that day.
        baseAmount: convertAmount(seed.amount, seed.currency, BASE_CURRENCY),
      });
    }
  }
  return created;
}
