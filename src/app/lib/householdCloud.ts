import { supabase } from './supabase';
import type { SettlementRow, SharedItemRow } from './sharedSync';

// The wire for shared expenses: everything that talks to public.households and
// friends. The decisions live in sharedSync.ts; this only carries them.
//
// Nothing here assumes the tables exist. Until supabase/schema-shared.sql has
// been run against the project, every call fails with SCHEMA_MISSING and the
// UI says so plainly - a feature nobody has provisioned yet must not look
// like a bug.

export const SCHEMA_MISSING = 'shared-schema-missing';

export interface RemoteMember {
  userId: string;
  displayName: string;
  color: string;
}

export interface RemoteHousehold {
  id: string;
  defaultSplit: { mode: 'equal' | 'percent'; ways?: number; percent?: number };
  trackBalance: boolean;
  members: RemoteMember[];
}

// Postgres says 42P01 for "relation does not exist" and PostgREST answers
// PGRST202 for an RPC it cannot find. Both mean the same thing to a user:
// the database has not been set up for this yet.
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205') return true;
  return /relation .* does not exist|could not find the function/i.test(error.message ?? '');
}

function fail(error: { code?: string; message?: string } | null): never {
  if (isMissingSchema(error)) throw new Error(SCHEMA_MISSING);
  throw new Error(error?.message || 'request failed');
}

/** Create a household on the server and join it as its first member. */
export async function createRemoteHousehold(
  displayName: string,
  color: string,
  defaultSplit: RemoteHousehold['defaultSplit'],
  trackBalance: boolean,
): Promise<string> {
  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id;
  if (!uid) throw new Error('not signed in');

  const { data, error } = await supabase
    .from('households')
    .insert({ created_by: uid, default_split: defaultSplit, track_balance: trackBalance })
    .select('id')
    .single();
  if (error || !data) fail(error);

  const { error: memberError } = await supabase
    .from('household_members')
    .insert({ household_id: data.id, user_id: uid, display_name: displayName, color });
  if (memberError) fail(memberError);

  return data.id as string;
}

/** Mint a join code. Server-side: codes are never guessable from the client. */
export async function createInviteCode(householdId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_household_invite', { hid: householdId });
  if (error) fail(error);
  return data as string;
}

/** Redeem a code and join its household. Returns the household id. */
export async function redeemInviteCode(
  code: string,
  displayName: string,
  color: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_household_invite', {
    invite_code: code,
    name: displayName,
    avatar_color: color,
  });
  if (error) fail(error);
  return data as string;
}

/** The household and everyone in it. Null when it is gone (they disbanded it). */
export async function fetchRemoteHousehold(householdId: string): Promise<RemoteHousehold | null> {
  const { data, error } = await supabase
    .from('households')
    .select('id, default_split, track_balance')
    .eq('id', householdId)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;

  const { data: members, error: memberError } = await supabase
    .from('household_members')
    .select('user_id, display_name, color')
    .eq('household_id', householdId);
  if (memberError) fail(memberError);

  return {
    id: data.id as string,
    defaultSplit: data.default_split as RemoteHousehold['defaultSplit'],
    trackBalance: data.track_balance as boolean,
    members: (members ?? []).map((m) => ({
      userId: m.user_id as string,
      displayName: (m.display_name as string) ?? '',
      color: (m.color as string) ?? '#7C5CFF',
    })),
  };
}

/** Either member may change the shared settings - see the RLS note. */
export async function updateRemoteHousehold(
  householdId: string,
  patch: { defaultSplit?: RemoteHousehold['defaultSplit']; trackBalance?: boolean },
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.defaultSplit) row.default_split = patch.defaultSplit;
  if (typeof patch.trackBalance === 'boolean') row.track_balance = patch.trackBalance;
  const { error } = await supabase.from('households').update(row).eq('id', householdId);
  if (error) fail(error);
}

export async function fetchSharedItems(householdId: string): Promise<SharedItemRow[]> {
  const { data, error } = await supabase
    .from('shared_items')
    .select('*')
    .eq('household_id', householdId);
  if (error) fail(error);
  return (data ?? []) as SharedItemRow[];
}

/** Upsert my authored rows. Ids match my local transaction ids, so an edit is
 *  the same call as a create. */
export async function pushSharedItems(rows: SharedItemRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('shared_items').upsert(rows, { onConflict: 'id' });
  if (error) fail(error);
}

/** Tombstone rather than delete: her device has a replica to drop, and it may
 *  not be online for days. */
export async function tombstoneSharedItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('shared_items')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) fail(error);
}

export async function fetchSettlements(householdId: string): Promise<SettlementRow[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select('*')
    .eq('household_id', householdId)
    .is('deleted_at', null);
  if (error) fail(error);
  return (data ?? []) as SettlementRow[];
}

export async function pushSettlement(
  householdId: string,
  id: string,
  fromUser: string,
  toUser: string,
  date: string,
  amount: number,
): Promise<void> {
  const { error } = await supabase.from('settlements').upsert(
    {
      id,
      household_id: householdId,
      from_user: fromUser,
      to_user: toUser,
      date,
      amount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) fail(error);
}

/** Leave: drop only my own membership row. Her copy of the ledger stays hers. */
export async function leaveRemoteHousehold(householdId: string): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id;
  if (!uid) return;
  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', uid);
  if (error && !isMissingSchema(error)) throw new Error(error.message);
}
