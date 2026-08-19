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
//   install    a browser visitor who has not installed. Half funnel, half
//              data safety: an installed app is exempt from Safari's 7-day
//              storage eviction, a plain tab is not.
//   customize  installed for two days, categories and sources still exactly
//              as seeded. The single highest-leverage setup step, and the one
//              screen people do not find on their own.
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
  /** When onboarding finished on this device; backfilled to first-seen for
   *  devices that predate the field, so their two-day clock starts honestly
   *  from the upgrade rather than firing on the spot. */
  onboardedAt?: string;
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

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** How many transactions make a guest ledger worth a backup warning. Below
 *  this, the stakes are a demo or a first afternoon; above it, months of
 *  real history sit one cleared cache from gone. */
export const BACKUP_NUDGE_MIN_TX = 25;

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
 * goes first, the recap expires with the month, the install banner waits but
 * matters (an uninstalled guest's data is evictable), the customize tip keeps
 * until it is either taken or refused.
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
  /** Total transactions - the size of what a guest stands to lose. */
  txCount: number;
  /** Any transaction dated in the previous calendar month. */
  hasPrevMonthActivity: boolean;
  catsUntouched: boolean;
  sourcesUntouched: boolean;
}): Nudge | null {
  const { prefs, now } = args;
  if (
    prefs.tips &&
    args.guest &&
    args.txCount >= BACKUP_NUDGE_MIN_TX &&
    backupClockDue(prefs.lastBackupAt, now) &&
    backupClockDue(prefs.backupSnoozedAt, now)
  ) {
    return 'backup';
  }
  if (prefs.recap && args.hasPrevMonthActivity && prefs.recapSeen !== monthKey(now)) {
    return 'recap';
  }
  if (prefs.tips && !prefs.installDismissed && args.mobile && !args.standalone) {
    return 'install';
  }
  if (
    prefs.tips &&
    !prefs.customizeDismissed &&
    args.standalone &&
    args.catsUntouched &&
    args.sourcesUntouched &&
    prefs.onboardedAt
  ) {
    const born = Date.parse(prefs.onboardedAt);
    if (Number.isFinite(born) && now.getTime() - born >= TWO_DAYS) return 'customize';
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
