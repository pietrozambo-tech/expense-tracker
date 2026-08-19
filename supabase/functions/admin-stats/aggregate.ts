// The arithmetic behind the developer screen's user dashboard, kept free of
// Deno, Supabase and the network so it can be tested directly
// (scripts/test-adminstats.mjs) rather than by deploying and squinting.
//
// Two inputs, deliberately separate:
//   accounts  every account, with the day it was created (auth.users)
//   opens     one (user, day) pair per day an account opened the app
//             (public.app_activity - see supabase/schema-activity.sql)
//
// and one rule that decides everything: a day's ACTIVE users are the accounts
// that opened the app that day; its NEW users are the subset of those created
// the same day. New is therefore always part of active, never added to it -
// so a stacked bar of new + returning is exactly the day's total, which is
// the only reading of the chart that cannot mislead.

export interface AccountRow {
  id: string;
  email: string | null;
  createdAt: string | null;
}

export interface OpenRow {
  userId: string;
  day: string; // YYYY-MM-DD
}

export interface DayStat {
  date: string;
  active: number;
  new: number;
  returning: number;
  /** Addresses that opened the app that day, new ones first. */
  emails: string[];
  newEmails: string[];
}

export interface Totals {
  accounts: number;
  activeToday: number;
  newToday: number;
  active7: number;
  new7: number;
  new30: number;
  /** How many accounts were left out as the owner's own (see excludeIds). */
  excluded: number;
}

export interface Aggregated {
  days: DayStat[];
  totals: Totals;
}

/** UTC day for a timestamp, or null. Local days would file one moment under
 *  two dates depending on where the reader is. */
export const dayOf = (iso: string | null | undefined): string | null =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : null;

/** The last `count` days ending today, newest first. */
export function windowDays(today: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function aggregate(args: {
  accounts: AccountRow[];
  opens: OpenRow[];
  today: Date;
  days?: number;
  /** Accounts to leave out entirely - the owner's own, so a developer opening
   *  the app forty times a day does not read as an audience. */
  excludeIds?: Set<string>;
  maxEmailsPerDay?: number;
}): Aggregated {
  const { accounts, opens, today } = args;
  const exclude = args.excludeIds ?? new Set<string>();
  const maxEmails = args.maxEmailsPerDay ?? 50;
  const dates = windowDays(today, args.days ?? 30);
  const inWindow = new Set(dates);

  const counted = accounts.filter((a) => !exclude.has(a.id));
  const byId = new Map(counted.map((a) => [a.id, a]));
  const bornOn = new Map<string, string>();
  for (const a of counted) {
    const d = dayOf(a.createdAt);
    if (d) bornOn.set(a.id, d);
  }

  // Unique users per day: the same account opening twice is one person, and
  // two devices write two rows for the same (user, day) only if the upsert
  // ever loses a race.
  const seen = new Map<string, Set<string>>();
  for (const o of opens) {
    if (!inWindow.has(o.day) || exclude.has(o.userId) || !byId.has(o.userId)) continue;
    const set = seen.get(o.day) ?? new Set<string>();
    set.add(o.userId);
    seen.set(o.day, set);
  }

  const days: DayStat[] = dates.map((date) => {
    const ids = [...(seen.get(date) ?? new Set<string>())];
    const newIds = ids.filter((id) => bornOn.get(id) === date);
    const isNew = new Set(newIds);
    const email = (id: string) => byId.get(id)?.email ?? null;
    // New accounts lead the list: on a day with traffic they are the part
    // worth reading first.
    const ordered = [...newIds, ...ids.filter((id) => !isNew.has(id))];
    return {
      date,
      active: ids.length,
      new: newIds.length,
      returning: ids.length - newIds.length,
      emails: ordered.map(email).filter((e): e is string => !!e).slice(0, maxEmails),
      newEmails: newIds.map(email).filter((e): e is string => !!e).slice(0, maxEmails),
    };
  });

  // Sign-ups counted from the accounts themselves, not from opens: an account
  // created on a day it never opened (a sign-up that bounced straight out)
  // still happened, and "new" in the totals should not quietly lose it.
  const createdWithin = (n: number) => {
    const recent = new Set(dates.slice(0, n));
    return counted.filter((a) => {
      const d = bornOn.get(a.id);
      return !!d && recent.has(d);
    }).length;
  };

  return {
    days,
    totals: {
      accounts: counted.length,
      activeToday: days[0]?.active ?? 0,
      newToday: days[0]?.new ?? 0,
      active7: new Set(
        days.slice(0, 7).flatMap((d) => [...(seen.get(d.date) ?? [])]),
      ).size,
      new7: createdWithin(7),
      new30: createdWithin(30),
      excluded: accounts.length - counted.length,
    },
  };
}
