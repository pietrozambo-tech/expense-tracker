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
  const mergeList = <T extends { id: string }>(
    baseList: T[] | undefined,
    localList: T[] | undefined,
    remoteList: T[] | undefined,
  ): T[] => {
    const b = new Set((baseList ?? []).map((x) => x.id));
    const l = new Map((localList ?? []).map((x) => [x.id, x]));
    const r = new Map((remoteList ?? []).map((x) => [x.id, x]));
    const out: T[] = [];

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
      if (r.has(id)) out.push(item); // in both - local wins
      else if (!b.has(id)) out.push(item); // we added it
      // else: it was in base and is gone remotely -> deleted there
    }
    for (const [id, item] of r) {
      if (l.has(id)) continue; // already handled
      if (!b.has(id)) out.push(item); // they added it
      // else: it was in base and is gone locally -> we deleted it
    }
    return out;
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
    };
  };

  // The same "this device's copy went missing" signal the lists use: if the
  // transactions vanished under a base that still remembers them, nothing this
  // device holds is trustworthy, settings included.
  const localCopyMissing =
    (local.transactions?.length ?? 0) === 0 && (base?.transactions?.length ?? 0) > 0;

  return {
    transactions: mergeList(base?.transactions, local.transactions, remote.transactions),
    recurringRules: mergeList(base?.recurringRules, local.recurringRules, remote.recurringRules),
    categories: mergeList(base?.categories, local.categories, remote.categories),
    incomeCategories: mergeList(base?.incomeCategories, local.incomeCategories, remote.incomeCategories),
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
