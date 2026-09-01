// In-app nudges: the app noticing something worth saying once, quietly.
//
// Four of them, shown ONE at a time on the Dashboard - a column of advice is
// nagging, a single slim card is a tip:
//
//   backup     a guest with a real ledger and no recent backup. Their data
//              exists in exactly one place - this device's browser storage -
//              and one cleared cache or lost phone erases it. The one nudge
//              about LOSING things, so it outranks the rest and returns
//              monthly rather than answering "no" forever.
//   recap      first opens of a new month: last month, told as one line.
//   customize  one transaction in, with categories, sources or a budget still
//              unset. A three-line checklist that ticks itself off: the
//              screens people do not find on their own, in one place.
//   install    a browser visitor who has not installed. Half funnel, half
//              data safety: an installed app is exempt from Safari's 7-day
//              storage eviction, a plain tab is not.
//
// Everything here is deliberately DEVICE-LOCAL (like the travel dismissals):
// the install banner is about this device, the recap is "did this screen show
// it", and the toggles mirror how real notification permissions work - per
// device. At worst a second device shows a card once more.
//
// This module is pure: the component hands in the facts, tests hand in
// fabricated ones.
import type { Category, Source } from '../types';

export interface NudgePrefs {
  /** Setup tips: the install banner and the customize card. */
  tips: boolean;
  /** The month-in-review card. */
  recap: boolean;
  installDismissed?: boolean;
  customizeDismissed?: boolean;
  /** The month ('YYYY-MM') whose recap was already shown and dismissed. */
  recapSeen?: string;
  /** The month ('YYYY-MM') whose review pointer - the "August summary" line
   *  on the new month's Dashboard - was already tapped. It only navigates,
   *  so one tap has said everything it has to say; kept in component state
   *  it resurrected on every tab switch, which read as a card that would
   *  not take no for an answer. */
  reviewSeen?: string;
  /** Backup-nudge clocks. A dismissal snoozes for thirty days rather than
   *  forever - new data keeps accruing, so the risk the card describes only
   *  grows - and any backup export (from the card OR Settings) resets the
   *  same clock, so a diligent user is simply never asked. */
  backupSnoozedAt?: string;
  lastBackupAt?: string;
}

export const DEFAULT_NUDGE_PREFS: NudgePrefs = { tips: true, recap: true };

const fingerprint = (x: { id: string; name: string; subcategories?: string[] }) =>
  `${x.id}|${x.name}|${(x.subcategories ?? []).join(',')}`;

/**
 * Whether a list still looks exactly as seeded - same entries, same names,
 * same chips. Any add, remove, rename or new subcategory counts as touched:
 * each of those means the user has found the screen, and the nudge's whole
 * premise is that they have not.
 */
export function untouched(
  current: Array<{ id: string; name: string; subcategories?: string[] }>,
  seeded: Array<{ id: string; name: string; subcategories?: string[] }>,
): boolean {
  if (current.length !== seeded.length) return false;
  const want = new Set(seeded.map(fingerprint));
  return current.every((c) => want.has(fingerprint(c)));
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const prevMonthKey = (d: Date) => monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** How many of the user's OWN transactions make a guest ledger worth a backup
 *  warning. Below this, the stakes are a first afternoon; above it, months of
 *  real history sit one cleared cache from gone. */
export const BACKUP_NUDGE_MIN_TX = 25;

/** How long the setup checklist's premise stays true.
 *
 *  The card says, in effect, "you have not found these screens yet". That is a
 *  fair guess in someone's first weeks and an insult after that: a person with
 *  months of their own rows has been round the app, and if they are still on
 *  our categories it is because they are fine with them. Past this many days
 *  the checklist stops asking and Settings keeps every one of its screens. */
export const SETUP_NUDGE_MAX_LEDGER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long this person has been keeping a ledger: the age in days of the
 * OLDEST row they wrote themselves. null when they have written none.
 *
 * Written, not dated. Importing a year of history is something a NEW user does
 * on their first afternoon, and dating the ledger by its oldest expense would
 * read that as a veteran; `createdAt` is stamped when the row was added, so an
 * import lands as one day old, which is what it is.
 *
 * A row carrying no createdAt counts as old rather than new. The app has always
 * stamped one, so a row without it arrived from a restored backup or a device
 * older than the field - both of which describe somebody established.
 */
export function ledgerAgeDays(rows: { createdAt?: string }[], now: Date): number | null {
  if (rows.length === 0) return null;
  let oldest = 0;
  for (const row of rows) {
    const ts = row.createdAt ? Date.parse(row.createdAt) : NaN;
    if (!Number.isFinite(ts)) return Infinity;
    oldest = Math.max(oldest, (now.getTime() - ts) / DAY_MS);
  }
  return oldest;
}

/** True when the clock is unset, unparseable, or thirty days stale. */
const backupClockDue = (iso: string | undefined, now: Date): boolean => {
  const ts = iso ? Date.parse(iso) : NaN;
  return !Number.isFinite(ts) || now.getTime() - ts >= THIRTY_DAYS;
};

export type Nudge = 'backup' | 'recap' | 'install' | 'customize';

/**
 * The one nudge worth showing right now, or null.
 *
 * Priority is urgency: the backup card guards against permanent loss so it
 * goes first, and the recap expires with the month. Then setup, and only then
 * the invitation to install.
 *
 * That last order used to be the other way round, and it is why nobody ever
 * saw the setup tip. The card is ONE card: on a phone that has not installed
 * the app - which is everybody, at first - the install banner won and stayed
 * won until dismissed, so a tip about categories could not physically appear
 * in a new user's first days. Installing is worth asking for; it is not worth
 * more than an app whose categories are somebody else's.
 */
export function dueNudge(args: {
  prefs: NudgePrefs;
  now: Date;
  /** Running as an installed app (home-screen / standalone display mode). */
  standalone: boolean;
  /** A phone or tablet browser - the install instructions only exist there. */
  mobile: boolean;
  /** No account: this device's storage is the only copy of everything. */
  guest: boolean;
  /** Everything on the Dashboard, sample rows included. Answers "is this
   *  screen empty", which is all the setup checklist needs to know. */
  txCount: number;
  /** The user's OWN transactions - demo rows excluded.
   *
   *  The two counts differ, and the backup card is why. Its premise is that
   *  the only copy of months of work is in one browser's storage; sample data
   *  is one tap from being regenerated, so it is not work and cannot be lost.
   *  Counting it meant loading the demo - which adds hundreds of rows - shot
   *  a brand-new guest straight past the threshold and told them to back up a
   *  ledger they had not written a line of. */
  ownTxCount: number;
  /** Age in days of the oldest row they wrote themselves (see ledgerAgeDays);
   *  null when they have written none, which is as new as it gets. */
  ledgerAgeDays: number | null;
  /** Any transaction dated in the previous calendar month. */
  hasPrevMonthActivity: boolean;
  catsUntouched: boolean;
  sourcesUntouched: boolean;
  /** A monthly budget is set. Its own card used to ask for this separately. */
  budgetSet: boolean;
  /** The user has said no to a budget - by switching it off in Settings, or
   *  by waving away the card that used to ask. An answer, not a gap. */
  budgetDeclined: boolean;
}): Nudge | null {
  const { prefs, now } = args;
  if (
    prefs.tips &&
    args.guest &&
    args.ownTxCount >= BACKUP_NUDGE_MIN_TX &&
    backupClockDue(prefs.lastBackupAt, now) &&
    backupClockDue(prefs.backupSnoozedAt, now)
  ) {
    return 'backup';
  }
  if (prefs.recap && args.hasPrevMonthActivity && prefs.recapSeen !== monthKey(now)) {
    return 'recap';
  }
  // Any ONE of the three being outstanding is enough. It used to need BOTH
  // categories and sources untouched, so renaming one category silenced the
  // advice about accounts for good - separate pieces of setup treated as one
  // switch.
  //
  // The budget is the third because it was a second card saying the same kind
  // of thing lower down the same screen: two to-do lists for one head. One
  // list, one dismissal - and Settings keeps a permanent budget control, so
  // waving this away strands nothing.
  //
  // A DECLINED budget cannot hold the card open. Switching the budget off in
  // Settings is an answer to this exact question, and the card that used to
  // ask it was careful about that; folding it into the checklist dropped the
  // care, so saying "no budget" summoned a card on the Dashboard asking for a
  // budget. The line still shows - unticked, tappable - whenever the card is
  // up for one of the other two, so nothing is hidden and nothing lies.
  //
  // And it waits for a transaction rather than for two days. Before the first
  // one the Dashboard's empty state is already saying "add your first
  // expense", and two invitations in one place are neither; after it, the
  // person has met the category grid and picked an account, so the sentence
  // finally refers to something they have seen. No standalone check: someone
  // using the app in a browser tab has exactly the same starter categories.
  //
  // And it is for someone still ARRIVING. The card was hidden behind the
  // install banner for its whole life until it was un-hidden, at which point
  // it appeared for the first time to people who had been using the app for
  // months - reading, correctly, as a first-run task list handed to a veteran.
  // The three lines are not urgent for them: they have been past Settings, and
  // still having our categories after all that time is a choice. So the
  // checklist now expires with its own premise.
  if (
    prefs.tips &&
    !prefs.customizeDismissed &&
    args.txCount >= 1 &&
    (args.ledgerAgeDays === null || args.ledgerAgeDays <= SETUP_NUDGE_MAX_LEDGER_DAYS) &&
    (args.catsUntouched || args.sourcesUntouched || (!args.budgetSet && !args.budgetDeclined))
  ) {
    return 'customize';
  }
  if (prefs.tips && !prefs.installDismissed && args.mobile && !args.standalone) {
    return 'install';
  }
  return null;
}

/** Facts about where the app is running, read once per render. */
export function runningEnv(): { standalone: boolean; mobile: boolean } {
  if (typeof window === 'undefined') return { standalone: false, mobile: false };
  const standalone =
    (window.navigator as { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
  const mobile = /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent ?? '');
  return { standalone, mobile };
}

/** Which install instructions apply - the two differ at every step. */
export function installPlatform(): 'ios' | 'android' {
  if (typeof window !== 'undefined' && /Android/i.test(window.navigator.userAgent ?? '')) return 'android';
  return 'ios';
}

// Type-only imports so the pure helpers above stay importable from tests
// without dragging the component tree in.
export type { Category, Source };
