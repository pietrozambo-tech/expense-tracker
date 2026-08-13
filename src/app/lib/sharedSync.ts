import type { Category, Settlement, Transaction } from '../types';

// Reconciling two paired accounts, as pure functions.
//
// Everything that decides WHAT should change lives here, so it can be proven
// without a network (scripts/test-shared.mjs drives a full two-device
// exchange through it). householdCloud.ts does the talking; this does the
// thinking.
//
// The governing rule, from docs/shared-expenses/README.md: a shared item is
// authored by one member and REPLICATED to the other. Replicas are rebuilt
// from the server rather than merged, so there is never a conflict between
// her edit and your stale copy - you hold nothing of your own to conflict.

/** A row of public.shared_items, in the client's shape. */
export interface SharedItemRow {
  id: string;
  household_id: string;
  author_id: string;
  payer_id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  base_amount: number | null;
  category_key: string | null;
  category_name: string | null;
  category_icon: string | null;
  subcategory: string | null;
  author_share: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface SettlementRow {
  id: string;
  household_id: string;
  from_user: string;
  to_user: string;
  date: string;
  amount: number;
  updated_at: string;
  deleted_at: string | null;
}

/** Replicas are prefixed so they can never collide with a locally created id
 *  and are recognisable in a stored ledger without consulting the server. */
export const replicaId = (sharedId: string) => `shared-${sharedId}`;

/**
 * Which of MY transactions belong on the server, as rows ready to upsert.
 *
 * Only my own shared expenses: a replica of hers is hers to publish, and
 * pushing it back would make each device echo the other forever.
 */
export function planPush(
  transactions: Transaction[],
  householdId: string,
  myUserId: string,
): SharedItemRow[] {
  return transactions
    .filter((t) => !!t.split && !t.fromShared && t.type !== 'income')
    .map((t) => ({
      id: t.id,
      household_id: householdId,
      author_id: myUserId,
      payer_id: myUserId,
      date: t.date,
      description: t.description,
      amount: t.amount,
      currency: t.currency || 'EUR',
      base_amount: typeof t.baseAmount === 'number' ? t.baseAmount : null,
      // The seed id is language-independent ('groceries' is 'Spesa' in an
      // Italian app), which is what makes mapping free on the other side.
      category_key: t.category?.id ?? null,
      category_name: t.category?.name ?? null,
      category_icon: t.category?.icon ?? null,
      subcategory: t.subcategory ?? null,
      author_share: t.split!.mine,
      updated_at: t.updatedAt ?? new Date().toISOString(),
      deleted_at: null,
    }));
}

/**
 * Ids I previously published that no longer exist locally (or stopped being
 * shared): they need a tombstone so her device drops its replica.
 */
export function planTombstones(
  transactions: Transaction[],
  remote: SharedItemRow[],
  myUserId: string,
): string[] {
  const stillShared = new Set(
    transactions.filter((t) => !!t.split && !t.fromShared).map((t) => t.id),
  );
  return remote
    .filter((r) => r.author_id === myUserId && !r.deleted_at && !stillShared.has(r.id))
    .map((r) => r.id);
}

/**
 * Where one of her items lands in MY categories.
 *
 * Exact id first: her starter categories carry the same ids as mine even in
 * another language. Then the lucide icon name, which is language-independent
 * too and is the best guess for a category she invented. Then a catch-all, so
 * money never goes missing from my totals while I decide.
 */
export function mapCategory(row: SharedItemRow, categories: Category[]): Category | null {
  if (row.category_key) {
    const exact = categories.find((c) => c.id === row.category_key);
    if (exact) return exact;
  }
  if (row.category_icon) {
    const byIcon = categories.find((c) => c.icon === row.category_icon);
    if (byIcon) return byIcon;
  }
  return categories.find((c) => c.id === 'others') ?? categories[0] ?? null;
}

export interface ReconcileResult {
  /** The ledger with her replicas added, refreshed and removed. */
  transactions: Transaction[];
  added: number;
  updated: number;
  removed: number;
}

/**
 * Fold the server's view of her expenses into my ledger.
 *
 * Idempotent by construction: replicas are addressed by their shared id and
 * rewritten wholesale, so running this twice cannot double anyone's
 * groceries - the property the spec calls out as the one that must hold.
 */
export function reconcileReplicas(
  transactions: Transaction[],
  remote: SharedItemRow[],
  myUserId: string,
  categories: Category[],
): ReconcileResult {
  const theirs = remote.filter((r) => r.author_id !== myUserId);
  const live = theirs.filter((r) => !r.deleted_at);
  const liveIds = new Set(live.map((r) => replicaId(r.id)));

  const existing = new Map(
    transactions.filter((t) => t.fromShared).map((t) => [t.id, t]),
  );

  let added = 0;
  let updated = 0;

  const replicas: Transaction[] = live.map((row) => {
    const id = replicaId(row.id);
    const prior = existing.get(id);
    const category = mapCategory(row, categories);
    // Two people: what is not her share is mine. Clamped so a malformed row
    // can never produce a negative expense on my side.
    const mine = Math.max(0, Math.round((row.amount - row.author_share) * 100) / 100);
    const next: Transaction = {
      id,
      description: row.description,
      amount: row.amount,
      category: category as Category,
      subcategory: row.subcategory ?? undefined,
      date: row.date,
      type: 'expense',
      currency: row.currency,
      baseAmount: row.base_amount ?? undefined,
      sourceId: undefined,
      updatedAt: row.updated_at,
      split: { mine },
      fromShared: row.id,
    };
    if (!prior) added++;
    else if (JSON.stringify(prior) !== JSON.stringify(next)) updated++;
    return next;
  });

  // Replicas of items she deleted, and orphans from a household we have left.
  const removed = transactions.filter((t) => t.fromShared && !liveIds.has(t.id)).length;

  const mine = transactions.filter((t) => !t.fromShared);
  // Date order, newest first, matching what the cloud merge already keeps.
  const all = [...mine, ...replicas].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  return { transactions: all, added, updated, removed };
}

/**
 * The running balance, in the home currency: positive means they owe you.
 *
 * Two-sided once paired. Every shared expense moves it by the half its payer
 * did NOT owe: one you fronted puts them in your debt, one she fronted (a
 * replica) puts you in hers. Settlements retire whatever is outstanding.
 *
 * Deliberately not month-scoped: a debt does not reset on the 1st.
 */
export function balanceFrom(
  transactions: Transaction[],
  settlements: Settlement[],
  homeValue: (t: Transaction) => number,
  shareValue: (t: Transaction) => number,
): number {
  const fronted = transactions.reduce((sum, t) => {
    if (!t.split || t.type === 'income') return sum;
    const owedOnIt = homeValue(t) - shareValue(t);
    // A replica is hers: what I did not owe on it is what SHE covered for me,
    // so it moves the balance the other way - by my own share.
    return t.fromShared ? sum - shareValue(t) : sum + owedOnIt;
  }, 0);
  const settled = settlements.reduce((sum, s) => sum + s.amount, 0);
  return Math.round((fronted - settled) * 100) / 100;
}
