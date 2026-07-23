import type { Category, Source, Transaction } from '../types';
import { supabase } from './supabase';

// The whole app dataset for one user. Stored as a single JSON record per user
// (table public.user_data, one row keyed by user_id, locked with RLS). This is
// the MVP: small data, offline cache in localStorage, last-write-wins across
// devices. It can be normalised into queryable tables later (e.g. for sharing).
export interface SyncPayload {
  transactions: Transaction[];
  categories: Category[];
  incomeCategories: Category[];
  sources: Source[];
  settings: {
    onboarded: boolean;
    userName: string;
    currency: string;
    hasSeenIntro: boolean;
    defaultSourceExpense?: string;
    defaultSourceIncome?: string;
  };
}

const TABLE = 'user_data';

// Load the signed-in user's data. Returns null when the account has no record
// yet (a brand-new account, or one that hasn't synced).
export async function loadCloud(userId: string): Promise<SyncPayload | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[cloud] load failed', error.message);
    throw error;
  }
  if (!data || !data.data) return null;
  return data.data as SyncPayload;
}

// Upsert the user's whole dataset.
export async function saveCloud(userId: string, payload: SyncPayload): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, data: payload, updated_at: new Date().toISOString() });

  if (error) {
    console.error('[cloud] save failed', error.message);
    throw error;
  }
}

// Delete the user's whole dataset (used by "Erase all data").
export async function deleteCloud(userId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) {
    console.error('[cloud] delete failed', error.message);
    throw error;
  }
}
