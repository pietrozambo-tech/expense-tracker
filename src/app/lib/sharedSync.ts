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
  updated_by?: string | null;
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

// Stamps must be compared as INSTANTS, never as strings. Postgres hands back
// "2026-08-13T10:00:00+00:00" where the client writes "2026-08-13T10:00:00.000Z";
// the two describe the same moment but sort against each other by character,
// which would have made every row look permanently out of date and re-pushed
// it forever - while a genuinely newer remote edit could be ignored.
const at = (s: string | undefined | null): number => (s ? Date.parse(s) || 0 : 0);

/** The same instant, in the one format the rest of the app writes - so the
 *  per-user cloud merge, which does compare stamps as strings, stays sane. */
const iso = (s: string): string => {
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : s;
};

/**
 * Who was out of pocket: true when the OTHER member paid.
 *
 * Entering an expense and paying for it are different acts, and a household
 * separates them constantly - she is at the till, you are the one who
 * remembers to log it. `payer_id` has been in the schema since the first
 * migration for exactly this; nothing was ever writing it.
 *
 * The fallback is what makes old rows safe: with no explicit payer, the author
 * paid, which is the rule the whole app used before. Every consumer of
 * "who paid" - the balance, the hero's two columns, the item list, the CSV -
 * goes through here, so they cannot drift apart.
 */
export const paidByPartner = (t: Transaction): boolean => t.split?.paidByThem ?? !!t.fromShared;

/** The shared id a local transaction maps to: its own for one I entered, the
 *  mirrored id for a copy of theirs. */
export const sharedIdOf = (t: Transaction): string => t.fromShared ?? t.id;

/**
 * One local transaction as a server row.
 *
 * `author_share` is always the AUTHOR's half, whichever device is pushing:
 * on the author's own copy that is `split.mine`, and on the other member's
 * copy it is whatever is left after their own share. That symmetry is what
 * lets either side edit without the halves swapping over.
 */
function toRow(
  t: Transaction,
  householdId: string,
  myUserId: string,
  prior: SharedItemRow | undefined,
  stamp: string,
  partnerUserId?: string,
): SharedItemRow {
  const mine = t.split?.mine ?? 0;
  const authorIsMe = !t.fromShared;
  // The other member, from the household if we know it, else read off a row
  // they authored. Without either we are not paired, and there is nobody for
  // the money to have come from but me.
  const other = partnerUserId ?? (prior && prior.author_id !== myUserId ? prior.author_id : undefined);
  const theyPaid = paidByPartner(t);
  return {
    id: sharedIdOf(t),
    household_id: householdId,
    // Authorship never moves: correcting someone's expense does not make it
    // yours, and who PAID is what the balance is computed from.
    author_id: prior?.author_id ?? myUserId,
    payer_id: theyPaid ? other ?? myUserId : myUserId,
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
    author_share: Math.round((authorIsMe ? mine : t.amount - mine) * 100) / 100,
    updated_by: myUserId,
    updated_at: t.updatedAt ?? stamp,
    deleted_at: null,
  };
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

export interface IncomingChange {
  id: string;
  description: string;
  kind: 'new' | 'edited' | 'removed';
}

export interface SyncPlan {
  /** The ledger after folding in whatever the server knows. */
  transactions: Transaction[];
  /** Rows the server has never seen: an INSERT, authored by me. */
  push: SharedItemRow[];
  /**
   * Rows that already exist and whose local copy is the newer statement: an
   * UPDATE, kept separate from `push` on purpose.
   *
   * They cannot be one call. supabase-js `.upsert()` compiles to INSERT ...
   * ON CONFLICT DO UPDATE, and Postgres requires the INSERT policy's WITH
   * CHECK to pass even when the row conflicts and only the UPDATE runs. That
   * policy says `author_id = auth.uid()`, so correcting the OTHER member's
   * expense was rejected by RLS - while adding and deleting, which are a plain
   * insert and a plain update, both worked. An edit is an update; sending it
   * as one is both correct and what the policies already allow.
   */
  patch: SharedItemRow[];
  /** True when `transactions` differs from what went in. */
  changed: boolean;
  /** What the other member did since we last looked, for the nudge. */
  incoming: IncomingChange[];
}

/** One server row as a local transaction. */
function toTransaction(
  row: SharedItemRow,
  myUserId: string,
  categories: Category[],
  prior: Transaction | undefined,
): Transaction {
  const authorIsMe = row.author_id === myUserId;
  // Two people: whatever is not the author's half is the other's. Clamped, so
  // a malformed row can never produce a negative expense on either side.
  const mine = authorIsMe
    ? row.author_share
    : Math.max(0, Math.round((row.amount - row.author_share) * 100) / 100);
  return {
    id: authorIsMe ? row.id : replicaId(row.id),
    description: row.description,
    amount: Number(row.amount),
    // A category I already chose for this row is mine to keep: re-mapping on
    // every pull would undo a deliberate re-filing on the next sync.
    category: (prior?.category ?? mapCategory(row, categories)) as Category,
    subcategory: row.subcategory ?? undefined,
    date: row.date,
    type: 'expense',
    currency: row.currency,
    baseAmount: row.base_amount ?? undefined,
    sourceId: prior?.sourceId,
    recurrence: prior?.recurrence,
    recurrenceOf: prior?.recurrenceOf,
    updatedAt: iso(row.updated_at),
    // Stated outright rather than inferred from authorship: that inference is
    // exactly what could not express "she entered it, I paid".
    split: { mine, paidByThem: row.payer_id !== myUserId },
    ...(authorIsMe ? {} : { fromShared: row.id }),
  };
}

/**
 * Reconcile my ledger with the household's, in BOTH directions.
 *
 * Either member may correct a shared expense, so this cannot be "push mine,
 * pull theirs": the author's device must not re-publish its stale copy over
 * the other member's correction. Every shared row is therefore resolved the
 * same way, whoever wrote it - last write wins on `updated_at`, exactly as
 * the per-user cloud merge already does for transactions.
 *
 * Idempotent by construction: rows are addressed by their shared id and
 * rewritten wholesale, so running this twice cannot double anyone's
 * groceries, and a settled state produces no pushes at all.
 *
 * Deletions are NOT inferred from absence. A row missing locally means "this
 * device has not pulled it yet" far more often than "someone deleted it" -
 * inferring would wipe the household's ledger the first time a device synced
 * with an empty store. Deleting is an explicit act, tombstoned at the moment
 * it happens (see handleDeleteExpense).
 */
export function planSync(
  transactions: Transaction[],
  remote: SharedItemRow[],
  myUserId: string,
  householdId: string,
  categories: Category[],
  /** The other member's auth id, so "she paid for something I entered" can be
   *  written down. Absent while local-only, where I am the only possible payer. */
  partnerUserId?: string,
): SyncPlan {
  const stamp = new Date().toISOString();
  const byId = new Map(remote.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const push: SharedItemRow[] = [];
  const patch: SharedItemRow[] = [];
  const incoming: IncomingChange[] = [];
  const out: Transaction[] = [];
  let changed = false;

  for (const t of transactions) {
    const isShared = !!t.split && t.type !== 'income';
    if (!isShared) {
      // Something that stopped being shared keeps its local life; the
      // tombstone was written when the user un-shared it.
      out.push(t);
      continue;
    }
    const sid = sharedIdOf(t);
    seen.add(sid);
    const r = byId.get(sid);

    if (r?.deleted_at) {
      // Removed by whoever deleted it - on both devices.
      incoming.push({ id: sid, description: t.description, kind: 'removed' });
      changed = true;
      continue;
    }

    const localStamp = at(t.updatedAt);
    if (!r) {
      // A replica whose original is not there is NOT mine to publish. Pushing
      // it would re-insert her expense under my name (toRow has no prior to
      // read the author from), which is worse than leaving it alone.
      if (t.fromShared) out.push(t);
      else {
        push.push(toRow(t, householdId, myUserId, undefined, stamp, partnerUserId));
        out.push(t);
      }
    } else if (at(r.updated_at) > localStamp) {
      // The server holds the newer statement: take it.
      const next = toTransaction(r, myUserId, categories, t);
      if (JSON.stringify(next) !== JSON.stringify(t)) {
        changed = true;
        if (r.updated_by && r.updated_by !== myUserId) {
          incoming.push({ id: sid, description: r.description, kind: 'edited' });
        }
      }
      out.push(next);
    } else if (localStamp > at(r.updated_at)) {
      patch.push(toRow(t, householdId, myUserId, r, stamp, partnerUserId));
      out.push(t);
    } else {
      out.push(t);
    }
  }

  // Rows this device has never seen.
  for (const r of remote) {
    if (seen.has(r.id) || r.deleted_at) continue;
    out.push(toTransaction(r, myUserId, categories, undefined));
    changed = true;
    if (r.author_id !== myUserId) {
      incoming.push({ id: r.id, description: r.description, kind: 'new' });
    }
  }

  // Newest first, matching the order the cloud merge already keeps.
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { transactions: out, push, patch, changed, incoming };
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
  memberIds: string[],
): number {
  // A debt is owed to a PERSON, not to whoever happens to be in the household
  // slot today. Without this the balance was every shared expense ever minus
  // every settlement ever, so ending one household and starting another handed
  // the new person the old person's debt.
  //
  // Turning sharing off already promises this in so many words ("the balance
  // and these settings are removed"), and each household mints a fresh Person,
  // so the member ids are what separates one from the next.
  //
  // Unstamped rows are counted in: they predate per-household attribution, and
  // the backfill in App.tsx claims them for the household in hand. This only
  // covers the instant before that runs.
  const ofThisHousehold = (t: Transaction) => {
    const ids = t.split?.withIds;
    if (!ids || ids.length === 0) return true;
    return ids.some((id) => memberIds.includes(id));
  };
  const fronted = transactions.reduce((sum, t) => {
    if (!t.split || t.type === 'income' || !ofThisHousehold(t)) return sum;
    const owedOnIt = homeValue(t) - shareValue(t);
    // Whoever FRONTED it, not whoever typed it: if she paid, what I did not
    // owe is what she covered for me, so it moves the balance the other way -
    // by my own share.
    return paidByPartner(t) ? sum - shareValue(t) : sum + owedOnIt;
  }, 0);
  const settled = settlements.reduce((sum, s) => (memberIds.includes(s.personId) ? sum + s.amount : sum), 0);
  return Math.round((fronted - settled) * 100) / 100;
}

/**
 * Who fronted the money, over a set of shared expenses.
 *
 * Reads the payer, not the author (see paidByPartner) - an expense she entered
 * and you paid for belongs in YOUR column. Same fact the balance is built on
 * (see balanceFrom), stated as two totals instead of one net figure, so the
 * hero's two columns and the balance card can never disagree about who has
 * been carrying the household.
 *
 * Full amounts on both sides, like everything else in the shared view: the
 * question is who was out of pocket at the till, not whose share it was.
 */
export function paidBy(
  transactions: Transaction[],
  homeValue: (t: Transaction) => number,
): { mine: number; theirs: number } {
  let mine = 0;
  let theirs = 0;
  for (const t of transactions) {
    if (!t.split || t.type === 'income') continue;
    if (paidByPartner(t)) theirs += homeValue(t);
    else mine += homeValue(t);
  }
  return { mine: Math.round(mine * 100) / 100, theirs: Math.round(theirs * 100) / 100 };
}

/**
 * What a household's membership list says about the pairing.
 *
 * The server never announces a departure: turning sharing off deletes the
 * leaver's own membership row and nothing else. So "who is in here" is the
 * only signal either device gets, and reading it correctly is the whole
 * mechanism - which is why it lives here, with the rest of the decisions,
 * rather than inline in a network callback.
 *
 * The trap is that ONE member means two opposite things. Before anyone
 * redeems your code you are alone in your own household, and that is not a
 * departure; it only becomes one if you previously knew who the partner was.
 * `knewPartner` is that memory, and it must be persisted state rather than a
 * session flag - a device that forgets on every launch would announce the
 * pairing again each morning.
 */
export type PairingChange = 'unchanged' | 'joined' | 'left';

export function pairingChange(
  members: { userId: string }[],
  myUserId: string,
  knewPartner: boolean,
): PairingChange {
  const hasOther = members.some((m) => m.userId && m.userId !== myUserId);
  if (hasOther && !knewPartner) return 'joined';
  if (!hasOther && knewPartner) return 'left';
  return 'unchanged';
}
