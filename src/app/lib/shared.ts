import type { Household, Person, SharedRemoval, Source, SplitRule, Settlement, Transaction } from '../types';
import { homeAmount, mineAmount } from '../utils/currency';
import { balanceFrom, paidByPartner } from './sharedSync';

// Helpers for shared expenses. Small on purpose: the split is resolved once at
// save time and stored on the transaction, so almost everything downstream is
// plain arithmetic over fields that already exist.

/** Your fraction of a shared amount under a rule. Clamped to [0, 1]. */
export function shareFraction(rule: SplitRule): number {
  const f =
    rule.mode === 'percent'
      ? (rule.percent ?? 50) / 100
      : 1 / Math.max(2, rule.ways ?? 2);
  return Math.min(1, Math.max(0, f));
}

/** Your share of `amount` in cents-exact form. Rounded normally: the spec's
 *  "remainder never lands on you" concern only bites past two decimals, and
 *  cents are as far as the app goes. */
export function myShareOf(amount: number, rule: SplitRule): number {
  return Math.round(amount * shareFraction(rule) * 100) / 100;
}

/** Is a transaction shared into the household ledger? */
export const isShared = (t: Transaction): boolean =>
  !!t.split && isFinite(t.split.mine);

/**
 * The running balance, in the home currency: positive means they owe you.
 *
 * Two-sided once the accounts are paired - a replica of their expense moves
 * it the other way. Scoped to `memberIds`, so a balance belongs to the
 * household that ran it up. The arithmetic lives in sharedSync.balanceFrom,
 * next to the reconciler that creates the replicas; this binds it to the app's
 * currency helpers.
 */
export function runningBalance(
  transactions: Transaction[],
  settlements: Settlement[],
  homeCurrency: string,
  memberIds: string[],
): number {
  return balanceFrom(
    transactions,
    settlements,
    (t) => homeAmount(t, homeCurrency),
    (t) => mineAmount(t, homeCurrency),
    memberIds,
  );
}

/** The default household shape created by Settings. */
export function newHousehold(personId: string): Household {
  return {
    id: `household-${Date.now().toString(36)}`,
    memberIds: [personId],
    defaultSplit: { mode: 'equal', ways: 2 },
    sharedCategoryIds: [],
    trackBalance: true,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Newest first, and within a day newest first as well.
 *
 * Every list of transactions in the app is a list in time order, and `date`
 * only resolves to the day - so same-day rows were left in whatever order the
 * array held. Adding groceries after the butcher put them BELOW it, and a
 * shared sync rebuilding the array could reorder a day on its own.
 *
 * `createdAt` is the tiebreaker, falling back to `updatedAt` for rows written
 * before it existed. That fallback is imperfect in one way worth knowing: an
 * OLD row edited today floats to the top of its own day. It applies to
 * historical data only - everything written from now on carries a real
 * creation stamp - and it is better than the alternative, which is no order at
 * all. Rows with neither keep their relative position, because Array.sort is
 * stable.
 */
export const recencyKey = (t: Transaction): number => {
  const stamp = t.createdAt ?? t.updatedAt;
  const ms = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

export function byRecency(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return recencyKey(b) - recencyKey(a);
}

/**
 * The Source that stands for the other member.
 *
 * Their expenses arrive with no source of their own - which card they used is
 * theirs, not ours, and it never crosses the wire - so they landed under "No
 * source" in the spending-by-source donut, where they read as a gap in your own
 * records rather than as money somebody else spent.
 *
 * A source named after them, wearing their initial in their colour, answers it
 * where the question is asked: the donut segment is the same violet as their
 * avatar everywhere else in the app.
 *
 * Derived from the person rather than stored, so the id is stable and the name
 * and colour follow theirs - which matters most right after pairing, when the
 * placeholder "Partner" becomes whatever they actually call themselves.
 */
export const partnerSourceId = (personId: string) => `src-partner-${personId}`;

/** The prefix every partner-derived source id carries. */
const PARTNER_SOURCE_PREFIX = 'src-partner-';

/**
 * The sources that may be CHOSEN for a new entry.
 *
 * A partner's source is not a bank the user added; it is derived from a person
 * being in the household, and it should live exactly as long as that fact
 * does. Turn sharing off - or pair with somebody else - and the old name has
 * no business still sitting in the Add screen's picker.
 *
 * Retired, not deleted, and the difference is the whole point: the rows she
 * paid for are still in the ledger and still yours to look at, so the source
 * has to keep resolving for the donut, Activity and an export. Deleting the
 * object would drop months of real spending into "No source". So this is a
 * filter applied where things are picked, never where they are displayed.
 *
 * Derived rather than a stored flag: the answer is already in the household,
 * so a field would only be a second copy of it to keep in step - and it would
 * need a migration for every ledger already carrying one of these.
 */
export function selectableSources(sources: Source[], household: Household | null): Source[] {
  const live = new Set((household?.memberIds ?? []).map(partnerSourceId));
  return sources.filter((s) => !s.id.startsWith(PARTNER_SOURCE_PREFIX) || live.has(s.id));
}

/**
 * Their change to this row, if you have not looked since - else null.
 *
 * Derived, not stored: every fact it needs is already on the transaction
 * (`split.updatedBy` says whose hand it was, `updatedAt` when, `createdAt`
 * whether it is new to you) measured against one instant on the device. A
 * stored "unread" flag would be a second copy of that to keep in step, and it
 * would need clearing from four screens instead of one timestamp being moved.
 *
 * "new" vs "edited" is the same comparison twice: a row that came into
 * existence since you last looked is news in itself; one that was already here
 * and got rewritten is a correction to something you have already read.
 *
 * Never true for your own edits, even from your other device. It reports what
 * SOMEONE ELSE did while you were away, and being told about your own typing
 * is how a notification stops being worth reading.
 */
export function unseenKind(
  t: Transaction,
  lastSeen: string,
  myUserId: string,
): 'new' | 'edited' | null {
  const by = t.split?.updatedBy;
  if (!by || by === myUserId || !isShared(t) || t.type === 'income') return null;
  const changedAt = Date.parse(t.updatedAt ?? '');
  if (!Number.isFinite(changedAt)) return null;
  const seenAt = Date.parse(lastSeen);
  if (Number.isFinite(seenAt) && changedAt <= seenAt) return null;
  const born = Date.parse(t.createdAt ?? '');
  return Number.isFinite(born) && Number.isFinite(seenAt) && born <= seenAt ? 'edited' : 'new';
}

/** What the other member did while you were away. */
export interface SharedNews {
  added: Transaction[];
  edited: Transaction[];
  removed: SharedRemoval[];
  /** Every change, however it is grouped: what the dot and the count read. */
  count: number;
}

/**
 * Everything unseen, in one pass, for the dot and the "new since you last
 * looked" group.
 *
 * Deletions come from their own store rather than from the ledger, because
 * there is no longer a row to look at - see SharedRemoval. Everything else is
 * still a transaction and answers for itself.
 */
export function sharedNews(
  transactions: Transaction[],
  removed: SharedRemoval[],
  lastSeen: string,
  myUserId: string,
): SharedNews {
  const added: Transaction[] = [];
  const edited: Transaction[] = [];
  for (const t of transactions) {
    const kind = unseenKind(t, lastSeen, myUserId);
    if (kind === 'new') added.push(t);
    else if (kind === 'edited') edited.push(t);
  }
  return { added, edited, removed, count: added.length + edited.length + removed.length };
}

/**
 * The row as it read before their edit, so the two versions can be measured
 * with the same functions.
 *
 * The locked FX rate is scaled with the amount rather than reused whole: it
 * was fixed at save time against the ORIGINAL figure, so a 130 → 145 correction
 * in a foreign currency has to carry its base value up with it or the delta
 * comes out in two different exchange rates.
 */
export function asWas(t: Transaction): Transaction | null {
  const w = t.split?.was;
  if (!w || !t.split) return null;
  const ratio = t.amount ? w.amount / t.amount : 1;
  return {
    ...t,
    amount: w.amount,
    baseAmount: typeof t.baseAmount === 'number' ? t.baseAmount * ratio : undefined,
    split: { ...t.split, mine: w.mine },
  };
}

/** A removal, in the shape the currency helpers read. */
const removalAsTxn = (r: SharedRemoval): Transaction =>
  ({ amount: r.amount, currency: r.currency, baseAmount: r.baseAmount, split: { mine: r.mine } } as Transaction);

/**
 * What their changes did to YOUR share, over the rows a period keeps.
 *
 * The one figure that earns a summary line: the household total moving is
 * their business, but your half moving is the number every other screen in the
 * app shows you. Scoped by `inPeriod` because it is reported beside a month
 * ("+74€ in your August"), while the balance below is not - a debt has no month.
 */
export function newsShareDelta(
  news: SharedNews,
  homeCurrency: string,
  inPeriod: (date: string) => boolean,
): number {
  let delta = 0;
  for (const t of news.added) {
    if (inPeriod(t.date)) delta += mineAmount(t, homeCurrency);
  }
  for (const t of news.edited) {
    if (!inPeriod(t.date)) continue;
    const before = asWas(t);
    // No snapshot means they changed something that was not a number.
    if (before) delta += mineAmount(t, homeCurrency) - mineAmount(before, homeCurrency);
  }
  for (const r of news.removed) {
    if (inPeriod(r.date)) delta -= mineAmount(removalAsTxn(r), homeCurrency);
  }
  return Math.round(delta * 100) / 100;
}

/**
 * What their changes did to the running balance.
 *
 * Deliberately the same arithmetic as balanceFrom, one row at a time: what
 * they fronted puts you in their debt by your share, what you fronted puts
 * them in yours by theirs. Stating it twice is a real risk of drift, and the
 * guard against it is that both are exercised by the same test - the delta
 * here must equal the difference between two full balance runs.
 */
export function newsBalanceDelta(news: SharedNews, homeCurrency: string): number {
  const moved = (t: Transaction, theyPaid: boolean) =>
    theyPaid
      ? -mineAmount(t, homeCurrency)
      : homeAmount(t, homeCurrency) - mineAmount(t, homeCurrency);
  let delta = 0;
  for (const t of news.added) delta += moved(t, paidByPartner(t));
  for (const t of news.edited) {
    const before = asWas(t);
    if (before) delta += moved(t, paidByPartner(t)) - moved(before, paidByPartner(before));
  }
  for (const r of news.removed) delta -= moved(removalAsTxn(r), r.paidByThem);
  return Math.round(delta * 100) / 100;
}

export function partnerSource(person: Person): Source {
  return {
    id: partnerSourceId(person.id),
    name: person.name,
    kind: 'bank',
    brand: person.color,
    monogram: (person.name[0] ?? '?').toUpperCase(),
    mark: 'monogram',
  };
}
