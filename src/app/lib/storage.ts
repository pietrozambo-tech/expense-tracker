import type { Category, Household, Person, RecurringRule, Settlement, SharedRemoval, Source, Transaction, UserSettings } from '../types';
import {
  categories as defaultCategories,
  incomeCategories as defaultIncomeCategories,
} from '../components/categories';
import {
  DEFAULT_SOURCES,
  DEFAULT_SOURCE_EXPENSE,
  DEFAULT_SOURCE_INCOME,
} from '../components/sources';
import { getItem, hydrate, removeItem, setItem } from './kv';
import type { CountryVisit } from './travel';

// Versioned keys so a future schema change can migrate (or ignore) old data.
const key = (name: string) => `expense-tracker.v1.${name}`;

const KEYS = {
  transactions: key('transactions'),
  categories: key('categories'),
  incomeCategories: key('income-categories'),
  sources: key('sources'),
  settings: key('settings'),
  recurringRules: key('recurring-rules'),
  // The last state this device and the cloud agreed on, plus that state's
  // version stamp. Kept across launches so the next hydrate can three-way
  // merge (and tell an offline addition apart from a remote deletion) instead
  // of taking the cloud wholesale.
  syncBase: key('sync-base'),
  // Whether the user chose to skip signing in. Durable with the rest: losing it
  // doesn't lose data, but it drops a guest back on the sign-in screen for no
  // reason they can see.
  guest: key('guest'),
  // Which account the data on this device belongs to. Device-local metadata:
  // never part of the cloud payload or a backup file. Absent for guests who
  // have never signed in - their data is adoptable by the first account that
  // does, which is the normal onboarding path.
  owner: key('owner'),
  // Transaction ids the user declined to fold into a recurring series, so the
  // offer is not repeated on every launch. Device-local: a nudge preference,
  // not data - at worst another device asks the same question once.
  backTagDismissed: key('backtag-dismissed'),
  // Shared expenses: the household config, the people in it, and settlements
  // against the running balance. Synced and backed up like everything else.
  household: key('household'),
  people: key('people'),
  settlements: key('settlements'),
  // Whether THIS DEVICE may enable shared expenses (the early-access code was
  // entered here once). An access gate, not data: never synced, never in a
  // backup - each device earns its own unlock. Cleared by an erase, which is
  // fine; the code can be re-entered.
  // The household id this device has already completed one full sync with.
  // Device-local, like the unlock: it exists so the FIRST sync after pairing
  // folds in her existing expenses quietly, instead of announcing every one of
  // them as news. Every sync after that is genuinely "while you were away".
  sharedSeen: key('shared-seen'),
  // The instant you last OPENED the shared view - not the last sync, which is
  // a different fact and happens while the phone is in your pocket.
  //
  // One timestamp serves both the shared view's "new since you last looked"
  // group and Activity's UPDATED badges, deliberately: they answer the same
  // question in two places, and two clocks would let a row be news on one
  // screen and old on the other. Device-local, like sharedSeen - "have I
  // looked" is about this pair of eyes, not about the account.
  sharedLastSeen: key('shared-last-seen'),
  // Their deletions, until you have seen them. Everything else that changed
  // is still a row in the ledger and can carry its own mark; a deleted one is
  // gone, so it needs somewhere else to wait.
  sharedRemoved: key('shared-removed'),
  // Which countries this device has been in, so the travel nudge can tell a
  // trip from an address. Device-local and never synced: it is a fact about
  // this phone's whereabouts, and it has no business on anyone's server or in
  // a backup file.
  travelCountries: key('travel-countries'),
};

/**
 * Pull the durable store into memory before the app reads any of it.
 *
 * Only does anything in the native shell, where localStorage can be evicted by
 * iOS and the real store is behind an async bridge. See lib/kv.ts.
 */
export const hydrateStorage = () => hydrate(Object.values(KEYS));

function read<T>(storageKey: string, fallback: T): T {
  try {
    const raw = getItem(storageKey);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(storageKey: string, value: unknown) {
  try {
    setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode) or full; the app keeps working in memory.
  }
}

export const DEFAULT_SETTINGS: UserSettings = {
  onboarded: false,
  userName: '',
  currency: 'EUR',
  hasSeenIntro: false,
  defaultSourceExpense: DEFAULT_SOURCE_EXPENSE,
  defaultSourceIncome: DEFAULT_SOURCE_INCOME,
};

export const loadSettings = () => read<UserSettings>(KEYS.settings, DEFAULT_SETTINGS);
export const saveSettings = (settings: UserSettings) => write(KEYS.settings, settings);

export const loadSources = () => read<Source[]>(KEYS.sources, DEFAULT_SOURCES);
export const saveSources = (sources: Source[]) => write(KEYS.sources, sources);

export const loadTransactions = () => read<Transaction[]>(KEYS.transactions, []);

export const loadRecurringRules = () => read<RecurringRule[]>(KEYS.recurringRules, []);
export const saveRecurringRules = (rules: RecurringRule[]) => write(KEYS.recurringRules, rules);
export const saveTransactions = (transactions: Transaction[]) =>
  write(KEYS.transactions, transactions);

export const loadCategories = () => read<Category[]>(KEYS.categories, defaultCategories);
export const saveCategories = (categories: Category[]) => write(KEYS.categories, categories);

export const loadIncomeCategories = () =>
  read<Category[]>(KEYS.incomeCategories, defaultIncomeCategories);
export const saveIncomeCategories = (categories: Category[]) =>
  write(KEYS.incomeCategories, categories);

// ── Shared expenses ─────────────────────────────────────────────────────────
//
// null household = the feature is off, and every shared surface (the header
// switcher, the add-sheet chip, the shared view) simply does not exist.

export const loadHousehold = () => read<Household | null>(KEYS.household, null);
export const saveHousehold = (h: Household | null) => {
  if (h === null) removeItem(KEYS.household);
  else write(KEYS.household, h);
};

export const loadPeople = () => read<Person[]>(KEYS.people, []);
export const savePeople = (people: Person[]) => write(KEYS.people, people);

export const loadSettlements = () => read<Settlement[]>(KEYS.settlements, []);
export const saveSettlements = (s: Settlement[]) => write(KEYS.settlements, s);


export const loadSharedSeen = () => getItem(KEYS.sharedSeen) ?? '';
export const saveSharedSeen = (householdId: string) => setItem(KEYS.sharedSeen, householdId);

export const loadSharedLastSeen = () => getItem(KEYS.sharedLastSeen) ?? '';
export const saveSharedLastSeen = (at: string) => setItem(KEYS.sharedLastSeen, at);

export const loadSharedRemovals = () => read<SharedRemoval[]>(KEYS.sharedRemoved, []);
export const saveSharedRemovals = (rows: SharedRemoval[]) => write(KEYS.sharedRemoved, rows);

export const loadTravelCountries = () => read<CountryVisit[]>(KEYS.travelCountries, []);
export const saveTravelCountries = (rows: CountryVisit[]) => write(KEYS.travelCountries, rows);

// ── Guest mode ──────────────────────────────────────────────────────────────

export const loadGuest = () => getItem(KEYS.guest) === 'true';
export const saveGuest = (guest: boolean) => {
  if (guest) setItem(KEYS.guest, 'true');
  else removeItem(KEYS.guest);
};

// ── Data owner ──────────────────────────────────────────────────────────────
//
// The id (and email, for messages a human can read) of the account this
// device's data belongs to. Signing in with a DIFFERENT account must not
// silently upload what it finds here - that is how a friend trying the app on
// your phone would walk away with a copy of your ledger in their cloud row.

export interface DataOwner {
  id: string;
  email: string | null;
}

export const loadOwner = (): DataOwner | null => {
  try {
    const raw = getItem(KEYS.owner);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o.id === 'string' ? { id: o.id, email: typeof o.email === 'string' ? o.email : null } : null;
  } catch {
    return null;
  }
};

export const saveOwner = (owner: DataOwner | null) => {
  if (!owner) {
    removeItem(KEYS.owner);
    return;
  }
  // Called on every successful cloud push; skip the no-op writes.
  const current = loadOwner();
  if (current && current.id === owner.id && current.email === owner.email) return;
  setItem(KEYS.owner, JSON.stringify(owner));
};

export function clearAllData() {
  try {
    // The guest flag is deliberately kept: erasing your data is not the same as
    // signing out of the app you are still standing in.
    Object.entries(KEYS)
      .filter(([name]) => name !== 'guest')
      .forEach(([, storageKey]) => removeItem(storageKey));
  } catch {
    // Ignore; nothing to clear if storage is unavailable.
  }
}

// ── Sync base ───────────────────────────────────────────────────────────────

export interface SyncBase {
  payload: unknown;
  version: string | null;
}

export const loadSyncBase = (): SyncBase | null => read<SyncBase | null>(KEYS.syncBase, null);
export const saveSyncBase = (base: SyncBase | null) => {
  // Through kv like every other path: raw localStorage.removeItem skipped the
  // native shell's durable store, so an erased base came back on the next
  // launch and the merge re-read deletions as remote additions.
  if (base === null) {
    removeItem(KEYS.syncBase);
    return;
  }
  write(KEYS.syncBase, base);
};

export const loadBackTagDismissed = (): string[] => read<string[]>(KEYS.backTagDismissed, []);
export const saveBackTagDismissed = (ids: string[]) => write(KEYS.backTagDismissed, ids);
