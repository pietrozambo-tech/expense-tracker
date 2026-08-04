import type { Category, RecurringRule, Source, Transaction } from '../types';
import { supabase } from './supabase';

// The whole app dataset for one user. Stored as a single JSON record per user
// (table public.user_data, one row keyed by user_id, locked with RLS). This is
// the MVP: small data, offline cache in localStorage, last-write-wins across
// devices. It can be normalised into queryable tables later (e.g. for sharing).
export interface SyncPayload {
  transactions: Transaction[];
  recurringRules?: RecurringRule[]; // optional: older records predate recurring rules
  categories: Category[];
  incomeCategories: Category[];
  sources: Source[];
  settings: {
    onboarded: boolean;
    userName: string;
    currency: string;
    monthlyBudget?: number;
    budgetNudgeDismissed?: boolean;
    hasSeenIntro: boolean;
    defaultSourceExpense?: string;
    defaultSourceIncome?: string;
    weekStartsOn?: number;
  };
}

const TABLE = 'user_data';

// The record as it exists on the server: the data, plus the stamp identifying
// which version of it we are holding. The stamp is what makes a write safe -
// see saveCloudChecked.
export interface CloudRecord {
  payload: SyncPayload;
  // null when the account has no row yet.
  version: string | null;
}

// Load the signed-in user's data. Returns null when the account has no record
// yet (a brand-new account, or one that hasn't synced).
export async function loadCloud(userId: string): Promise<CloudRecord | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[cloud] load failed', error.message);
    throw error;
  }
  if (!data || !data.data) return null;
  return { payload: data.data as SyncPayload, version: (data.updated_at as string) ?? null };
}

// Just the version stamp - a few bytes rather than the whole dataset. Used to
// answer "has anything changed since I last looked?" without paying for a
// download that is usually unnecessary.
export async function loadCloudVersion(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[cloud] version check failed', error.message);
    throw error;
  }
  return (data?.updated_at as string) ?? null;
}

// Do two stamps name the same moment?
//
// Not the same question as "are these the same string". The client writes an
// ISO stamp ending in `Z`; Postgres keeps it as a timestamptz and hands it
// back as `+00:00`, with trailing zeros trimmed off the fraction - so a write
// of `...:00.120Z` reads back as `...:00.12+00:00`. Same instant, different
// text.
//
// Comparing the text meant a device never recognised its OWN last write: every
// poll saw a "new" version, downloaded the dataset, merged it into itself and
// re-rendered - then pushed the result, giving the next poll something new to
// find. A phone sitting idle on the dashboard did that every twenty seconds,
// forever, and the charts visibly redrew each time.
export function sameVersion(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return !Number.isNaN(ta) && !Number.isNaN(tb) && ta === tb;
}

// Value equality for two datasets, insensitive to key order and treating an
// absent field as an undefined one (`monthlyBudget` is either).
//
// Used to answer "did that pull actually change anything?". A merge can be a
// no-op - another device pushing an unchanged payload still moves the version
// stamp - and applying a no-op costs a full remount of the screen.
function canonical(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

export function samePayload(a: SyncPayload | null, b: SyncPayload | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return canonical(a) === canonical(b);
}

// The stamp for the next write. It must be strictly later than the one being
// replaced, and a plain `new Date()` is not enough: two devices writing in the
// same millisecond produce identical stamps, and then the version check passes
// for a device whose data is already stale - which is the exact bug this whole
// mechanism exists to prevent. Rare in the wild, but the failure is silent
// data loss, so it is worth the two lines.
//
// Because every write is conditioned on the previous version, only one device
// can ever succeed from a given stamp - so bumping by a millisecond here makes
// the sequence strictly increasing rather than merely usually increasing.
function nextVersion(expectedVersion: string | null): string {
  const now = Date.now();
  const previous = expectedVersion ? Date.parse(expectedVersion) : NaN;
  const ms = Number.isNaN(previous) ? now : Math.max(now, previous + 1);
  return new Date(ms).toISOString();
}

export type SaveResult =
  | { ok: true; version: string }
  // Someone else wrote since we last looked. Our data is untouched on the
  // server - the caller has to reconcile and try again.
  | { ok: false; conflict: true };

// Write the dataset, but only if the server still holds the version we last
// saw. The check happens inside the write, as part of the same statement, so
// this is still a single round trip - no slower than the unconditional upsert
// it replaces.
//
// The previous version of this simply upserted, which meant a device holding a
// stale snapshot silently erased whatever it had not seen. Two phones on one
// account could destroy each other's transactions with the sync indicator
// showing green throughout.
export async function saveCloudChecked(
  userId: string,
  payload: SyncPayload,
  expectedVersion: string | null,
): Promise<SaveResult> {
  const version = nextVersion(expectedVersion);

  // No row yet: insert. If someone else got there first the primary key
  // rejects it, which is the same conflict by another name.
  if (expectedVersion === null) {
    const { error } = await supabase
      .from(TABLE)
      .insert({ user_id: userId, data: payload, updated_at: version });
    if (error) {
      if (error.code === '23505') return { ok: false, conflict: true }; // unique violation
      console.error('[cloud] save failed', error.message);
      throw error;
    }
    return { ok: true, version };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ data: payload, updated_at: version })
    .eq('user_id', userId)
    .eq('updated_at', expectedVersion)
    .select('updated_at');

  if (error) {
    console.error('[cloud] save failed', error.message);
    throw error;
  }
  // No rows matched: the stamp moved, so somebody else wrote first.
  if (!data || data.length === 0) return { ok: false, conflict: true };
  return { ok: true, version };
}

// Three-way merge of two versions of the dataset that diverged from a common
// starting point.
//
// `base` is what the server held when this device last agreed with it, and it
// is what makes deletions work: an item missing from one side was either
// deleted there (it exists in base) or added on the other side (it does not).
// Without base we could only union, and every merge would resurrect whatever
// the other device had deleted.
//
// Concurrent edits to the SAME item resolve to `local` - the device doing the
// merge is the one in the user's hand.
export function mergePayloads(
  base: SyncPayload | null,
  local: SyncPayload,
  remote: SyncPayload,
): SyncPayload {
  const mergeList = <T extends { id: string; updatedAt?: string }>(
    baseList: T[] | undefined,
    localList: T[] | undefined,
    remoteList: T[] | undefined,
  ): T[] => {
    const b = new Map((baseList ?? []).map((x) => [x.id, x]));
    const l = new Map((localList ?? []).map((x) => [x.id, x]));
    const r = new Map((remoteList ?? []).map((x) => [x.id, x]));
    const out: T[] = [];
    // Deep equality via JSON. Key order is stable here because every copy of
    // an item round-trips through the same serialisation paths; a false
    // "changed" verdict only degrades to the old local-wins behaviour, which
    // keeps a stale copy but never discards a real edit.
    const changed = (a: T | undefined, base: T | undefined) =>
      JSON.stringify(a) !== JSON.stringify(base);

    // An empty local list against a base that still remembers items is NOT
    // "the user deleted everything here". Erasing takes the whole cloud row
    // with it (see handleEraseAllData), and deleting item by item syncs as it
    // goes, so both of those leave the base empty too. A base that outlives
    // its list means this device's copy went missing - storage cleared, a
    // write that never landed - and the rule below would read that absence as
    // 431 deliberate deletions and push them to every other device.
    //
    // The one case this gets wrong is deleting every last item while offline
    // and relaunching before a sync: those come back. Resurrecting a handful
    // of transactions is a nuisance; propagating a wipe is not recoverable.
    if (l.size === 0 && b.size > 0) return [...r.values()];

    for (const [id, item] of l) {
      if (r.has(id)) {
        const theirs = r.get(id) as T;
        // In both. When each copy says when it was last edited, believe the
        // stamps: the newer edit wins no matter which device is asking - the
        // one signal that stays true even when the other device runs an older
        // build of the merge and pushes stale copies around. Only when a stamp
        // is missing on either side (pre-stamp data) fall back to three-way:
        // if this device didn't touch it, the server's copy is the newer
        // truth; if it did, that edit is deliberate and stands. The flat
        // "local wins" this replaces meant an edit never propagated at all -
        // the other device's unchanged copy beat it on every merge, then
        // wrote the old value back over it.
        if (item.updatedAt && theirs.updatedAt && item.updatedAt !== theirs.updatedAt) {
          out.push(item.updatedAt > theirs.updatedAt ? item : theirs);
        } else {
          out.push(changed(item, b.get(id)) ? item : theirs);
        }
      } else if (!b.has(id)) out.push(item); // we added it
      // else: it was in base and is gone remotely -> deleted there
    }
    for (const [id, item] of r) {
      if (l.has(id)) continue; // already handled
      if (!b.has(id)) out.push(item); // they added it
      // else: it was in base and is gone locally -> we deleted it
    }
    return out;
  };

  // Subcategory lists merge chip by chip when both devices touched the same
  // category. Item-level "newer copy wins" was silently destructive here: add
  // "Tobacco" on the phone while the tablet holds a stale copy and renames the
  // category, and whichever copy wins arrives WITHOUT the other one's chip.
  // Three-way on the list itself keeps both edits: a chip absent from base is
  // an addition (kept from either side), a base chip missing on one side is a
  // deletion (respected from either side). Names compare case-insensitively;
  // the first-seen spelling stands.
  const mergeChips = (baseChips: string[] = [], ours: string[] = [], theirs: string[] = []): string[] => {
    const low = (x: string) => x.toLowerCase();
    const inBase = new Set(baseChips.map(low));
    const inOurs = new Set(ours.map(low));
    const inTheirs = new Set(theirs.map(low));
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (name: string) => {
      const k = low(name);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(name);
      }
    };
    for (const name of ours) if (!inBase.has(low(name)) || inTheirs.has(low(name))) push(name);
    for (const name of theirs) if (!inBase.has(low(name)) || inOurs.has(low(name))) push(name);
    return out;
  };

  // Categories go through the same per-item merge as everything else (which
  // resolves name/icon/colour), then the chips are reconciled for ids both
  // sides hold. A category only one side has needs nothing: it was added or
  // deleted, never concurrently edited.
  const mergeCategoryList = (
    baseList: Category[] | undefined,
    localList: Category[] | undefined,
    remoteList: Category[] | undefined,
  ): Category[] => {
    const merged = mergeList(baseList, localList, remoteList);
    const b = new Map((baseList ?? []).map((c) => [c.id, c]));
    const l = new Map((localList ?? []).map((c) => [c.id, c]));
    const r = new Map((remoteList ?? []).map((c) => [c.id, c]));
    return merged.map((cat) => {
      const ours = l.get(cat.id);
      const theirs = r.get(cat.id);
      if (!ours || !theirs) return cat;
      const chips = mergeChips(b.get(cat.id)?.subcategories, ours.subcategories, theirs.subcategories);
      const same = (x: string[] = []) => x.join(' ');
      return same(chips) === same(cat.subcategories) ? cat : { ...cat, subcategories: chips };
    });
  };

  // Settings have no ids to merge on, so they go field by field against the
  // base. "The device in the user's hand wins" was only half right: it is true
  // of a value this device just CHANGED, and false of one it simply never had.
  // A laptop signing in for the first time holds no budget and no name, and
  // taking its settings wholesale wiped both - on that device and then, on its
  // next write, for every other one.
  const mergeSettings = (): SyncPayload['settings'] => {
    const b = base?.settings;
    const pick = <K extends keyof SyncPayload['settings']>(key: K): SyncPayload['settings'][K] => {
      // Changed here since this device last agreed with the server, so it is a
      // deliberate edit - including clearing a budget back to nothing.
      if (b && local.settings[key] !== b[key]) return local.settings[key];
      // Otherwise this device has no opinion, so the server's value stands as
      // it is. Note the deliberate absence of `?? local`: a cleared budget
      // arrives as undefined, and falling back on local would put it straight
      // back. Local is the answer only when the server has no settings at all.
      return remote.settings ? remote.settings[key] : local.settings[key];
    };
    return {
      onboarded: pick('onboarded'),
      userName: pick('userName'),
      currency: pick('currency'),
      monthlyBudget: pick('monthlyBudget'),
      budgetNudgeDismissed: pick('budgetNudgeDismissed'),
      hasSeenIntro: pick('hasSeenIntro'),
      defaultSourceExpense: pick('defaultSourceExpense'),
      defaultSourceIncome: pick('defaultSourceIncome'),
      weekStartsOn: pick('weekStartsOn'),
    };
  };

  // The same "this device's copy went missing" signal the lists use: if the
  // transactions vanished under a base that still remembers them, nothing this
  // device holds is trustworthy, settings included.
  const localCopyMissing =
    (local.transactions?.length ?? 0) === 0 && (base?.transactions?.length ?? 0) > 0;

  // The merge walks local order and appends the other device's additions at
  // the end, which scrambled the visible list: Activity renders array order
  // within a day, so a transaction synced across landed at the bottom of its
  // day and rows appeared to move. Dates are YYYY-MM-DD, so a string compare
  // is a date compare; the sort is stable, so same-day rows keep their
  // relative order and an edit never moves a row.
  const byDateDesc = <T extends { date: string }>(list: T[]): T[] =>
    [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    transactions: byDateDesc(mergeList(base?.transactions, local.transactions, remote.transactions)),
    recurringRules: mergeList(base?.recurringRules, local.recurringRules, remote.recurringRules),
    categories: mergeCategoryList(base?.categories, local.categories, remote.categories),
    incomeCategories: mergeCategoryList(base?.incomeCategories, local.incomeCategories, remote.incomeCategories),
    sources: mergeList(base?.sources, local.sources, remote.sources),
    settings: localCopyMissing && remote.settings ? remote.settings : mergeSettings(),
  };
}

// Delete the user's whole dataset (used by "Erase all data").
export async function deleteCloud(userId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) {
    console.error('[cloud] delete failed', error.message);
    throw error;
  }
}
