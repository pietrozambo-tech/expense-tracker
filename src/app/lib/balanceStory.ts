import type { Settlement, Transaction } from '../types';
import { belongsToHousehold, paidByPartner } from './sharedSync';
import { homeAmount, mineAmount } from '../utils/currency';
import { isShared } from './shared';

// How the balance got where it is.
//
// The running total on the shared view answers "how much", and until now
// nothing answered "how". A settlement in particular moved the number and left
// no mark: money went back and forth and the ledger showed only the arithmetic
// result, which is the one thing a couple never argues about.
//
// So: every event that ever moved the balance, in order, with the balance
// carried through them and the months as the sections it runs across. A
// settlement is not filtered out of that stream - it is the interesting part of
// it, the moment the line was cut back to zero.

/** One thing that moved the balance. */
export interface StoryEntry {
  id: string;
  kind: 'expense' | 'settlement';
  date: string;
  /** The expense's description; settlements carry none and are labelled by the
   *  screen, which is the only place that knows the partner's name. */
  description: string;
  /** What it did to the balance, in the home currency. Positive means they owe
   *  you more than they did a moment ago. */
  delta: number;
  /** The balance immediately AFTER this entry - the whole point of the list. */
  running: number;
  /** Expenses: the household figure and your share, for the arithmetic line. */
  full?: number;
  mine?: number;
  /** Expenses: who was out of pocket, which is what decides the sign. */
  paidByThem?: boolean;
  /** Settlements: what the balance stood at when it was recorded, where that
   *  was written down. Absent on settlements made before it was. */
  balanceAt?: number;
}

/** A month of the story, and what it did on balance. */
export interface StoryMonth {
  /** YYYY-MM. */
  key: string;
  /** Net movement across the month. */
  delta: number;
  /** The balance at the end of the month - what you carried into the next. */
  running: number;
  /** A settlement lands in it, so the line was cut here. */
  settled: boolean;
  /** Newest first, the way every list in the app reads. */
  entries: StoryEntry[];
}

/**
 * The whole ledger as a story, newest month first.
 *
 * Deliberately built by replaying every event in date order rather than by
 * subtracting totals: the running figure beside each row has to be the balance
 * as it stood at that moment, and a total cannot say when.
 *
 * The arithmetic is the same as balanceFrom's, one row at a time - what they
 * fronted puts you in their debt by your share, what you fronted puts them in
 * yours by theirs. Two statements of one rule can drift, so the test for this
 * asserts that the last running figure equals a full runningBalance() run.
 */
export function balanceStory(
  transactions: Transaction[],
  settlements: Settlement[],
  homeCurrency: string,
  memberIds: string[],
): StoryMonth[] {
  const events: Omit<StoryEntry, 'running'>[] = [];

  for (const t of transactions) {
    if (!isShared(t) || t.type === 'income' || !belongsToHousehold(t, memberIds)) continue;
    const full = homeAmount(t, homeCurrency);
    const mine = mineAmount(t, homeCurrency);
    const theyPaid = paidByPartner(t);
    events.push({
      id: t.id,
      kind: 'expense',
      date: t.date,
      description: t.description,
      delta: theyPaid ? -mine : full - mine,
      full,
      mine,
      paidByThem: theyPaid,
    });
  }

  for (const s of settlements) {
    if (!memberIds.includes(s.personId)) continue;
    events.push({
      id: s.id,
      kind: 'settlement',
      date: s.date,
      description: '',
      // Settling retires what is outstanding, so it moves the balance the
      // opposite way to its own sign - a positive settlement (they paid you)
      // brings a positive balance down.
      delta: -s.amount,
      balanceAt: s.balanceAt,
    });
  }

  // Oldest first to carry the running total; settlements last within a day, so
  // a payment made the same afternoon as a shop reads as closing it rather than
  // preceding it.
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'settlement' ? 1 : -1;
    return 0;
  });

  const months = new Map<string, StoryMonth>();
  let running = 0;
  for (const e of events) {
    running = Math.round((running + e.delta) * 100) / 100;
    const key = e.date.slice(0, 7);
    let month = months.get(key);
    if (!month) {
      month = { key, delta: 0, running: 0, settled: false, entries: [] };
      months.set(key, month);
    }
    month.delta = Math.round((month.delta + e.delta) * 100) / 100;
    month.running = running;
    if (e.kind === 'settlement') month.settled = true;
    // Unshifted, so each month ends up newest-first without a second sort.
    month.entries.unshift({ ...e, running });
  }

  return [...months.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}
