import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { createPortal } from 'react-dom';
import { BarChart3, Plus, List, X, Settings as SettingsIcon, TrendingUp, ChevronDown, Repeat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CURRENCIES, convertAmount, BASE_CURRENCY } from './utils/currency';
import type { Transaction, Source, RecurringRule, Category } from './types';
import {
  clearAllData,
  loadCategories,
  loadIncomeCategories,
  loadSettings,
  loadSources,
  loadTransactions,
  loadRecurringRules,
  saveRecurringRules,
  saveCategories,
  saveIncomeCategories,
  saveSettings,
  saveSources,
  saveTransactions,
  loadSyncBase,
  saveSyncBase,
  loadOwner,
  saveOwner,
  loadBackTagDismissed,
  saveBackTagDismissed,
} from './lib/storage';
import { DEFAULT_SOURCES, DEFAULT_SOURCE_EXPENSE, DEFAULT_SOURCE_INCOME } from './components/sources';
import { SourceLogo } from './components/SourceLogo';
import { SourceSelectorModal } from './components/SourceSelectorModal';
import { getDemoTransactions } from './lib/demoData';
import { buildImport, applyImportDecision, type ImportPayload, type ImportResult } from './lib/importData';
import { ImportSummaryDialog } from './components/ImportSummaryDialog';
import { ImportReviewDialog } from './components/ImportReviewDialog';
import { buildBackup, downloadBackup, isBackupFile } from './lib/backup';
import { buildTransactionsCsv, downloadTransactionsCsv } from './lib/csv';
import { buildDescriptionSuggestions, type DescriptionSuggestion } from './lib/suggestions';
import { Activity } from './components/Activity';
import { AmountInput } from './components/AmountInput';
import { DateInput } from './components/DateInput';
import { CategorySelector } from './components/CategorySelector';
import { SaveButton } from './components/SaveButton';
import { DescriptionInput } from './components/DescriptionInput';
import { Onboarding } from './components/Onboarding';
import { useAuth } from './auth/AuthProvider';
import { processRecurrence, buildRuleTemplate, newRuleId, occurrenceDueDate, isActiveRule, applyFutureEdit, findPastSeriesMatches, findUnclaimedSeriesRows, findGeneratedDuplicates, tagPastSeries, type SeriesClaim } from './lib/recurrence';
import { SeriesClaimDialog } from './components/SeriesClaimDialog';
import { RecurringScopeDialog } from './components/RecurringScopeDialog';
import { ConfirmDialog } from './components/ConfirmDialog';

// The heavyweight screens load on demand so the initial bundle stays small.
// (Named exports wrapped for React.lazy's default-export contract.)
import type { DashboardViewState, TrendViewState } from './components/Dashboard';
import type { ActivityViewState } from './components/Activity';

// Loading a lazy chunk can fail when the app has been open across a deploy:
// the running page references content-hashed filenames (Settings-abc123.js)
// that no longer exist on the server. That is a dead end on an installed PWA,
// which can stay open for days - so reload once to pick up the fresh
// index.html and its new chunk names instead of showing the error screen. The
// sessionStorage flag stops a reload loop if the chunk is genuinely missing
// (e.g. offline and not cached); the second failure falls through to the
// error boundary.
function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key: string,
) {
  const flag = `trackly.chunk-reload.${key}`;
  return lazy(async () => {
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(flag);
      } catch {
        /* storage unavailable */
      }
      return mod;
    } catch (err) {
      let alreadyRetried = false;
      try {
        alreadyRetried = sessionStorage.getItem(flag) === '1';
        if (!alreadyRetried) sessionStorage.setItem(flag, '1');
      } catch {
        /* storage unavailable - fall through to the error boundary */
      }
      if (!alreadyRetried && typeof window !== 'undefined') {
        window.location.reload();
        return new Promise<never>(() => {}); // hold until the reload takes over
      }
      throw err;
    }
  });
}

const Dashboard = lazyWithRetry(() => import('./components/Dashboard').then((m) => ({ default: m.Dashboard })), 'dashboard');
const Settings = lazyWithRetry(() => import('./components/Settings').then((m) => ({ default: m.Settings })), 'settings');

// Fetch the tab chunks before they are needed. Each tab is a separate file
// (Settings is ~77 kB) that is otherwise not requested until the tab is
// tapped - which puts a network round trip in the middle of a tap, on
// whatever connection the user happens to be on. Warming them once the app is
// idle turns that into a cache hit.
//
// Same specifiers as the lazy() factories above, so these resolve to the same
// chunks and the module registry hands the cached copy to React later.
function prefetchTabs() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  // Data Saver means the user has asked not to spend bytes on maybes.
  if (nav.connection?.saveData) return;
  void import('./components/Dashboard');
  void import('./components/Settings');
}
const WelcomeCarousel = lazyWithRetry(() => import('./components/WelcomeCarousel').then((m) => ({ default: m.WelcomeCarousel })), 'carousel');
const SignIn = lazyWithRetry(() => import('./auth/SignIn').then((m) => ({ default: m.SignIn })), 'signin');
import { TracklyLogo } from './components/TracklyLogo';
import {
  loadCloud,
  loadCloudVersion,
  saveCloudChecked,
  deleteCloud,
  mergePayloads,
  sameVersion,
  samePayload,
  type SyncPayload,
} from './lib/cloud';
import { track } from './lib/analytics';
import { categories as initialCategories, incomeCategories as initialIncomeCategories, defaultCategoriesFor, defaultIncomeCategoriesFor } from './components/categories';
import { reassignToOthers, CATCHALL_RE } from './lib/categoryOps';
import { switchGlow } from './components/categoryColors';
import { t, getLanguage, setLanguage, type Language } from './i18n';
import { defaultSourcesFor } from './components/sources';

// One tab of the bottom dock. Module-level on purpose: defined inside App it
// would be a new component type on every render, and React would remount all
// four tabs each time state changes.
//
// The geometry is deliberate, measured against the shipped dock on a real
// iPhone screenshot, where the stack read bottom-heavy (21px of air above the
// icons, 28px below the labels):
// - leading-none on the label: at an inherited ~1.5 line-height a 9.5px label
//   sits in a ~14px box whose slack all lands under the glyphs - that alone
//   was most of the asymmetry.
// - The active pill behind the icon (not around the whole stack) is the
//   Material 3 "active indicator", and the same treatment Instagram's bar
//   uses; a colour change alone was too quiet a selected state.
// Stack: 28px pill + 4px + 10px label = 42px, against the 46px add button, so
// the grid centres both within a 62px dock with 2px of slack either side.
function DockTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center pointer-events-auto justify-self-center">
      <span
        className="w-12 h-7 rounded-full flex items-center justify-center transition-colors duration-200"
        style={{ backgroundColor: active ? 'rgba(255, 255, 255, 0.13)' : 'transparent' }}
      >
        <Icon size={22} style={{ color: active ? '#FFFFFF' : '#8E8E93' }} strokeWidth={active ? 2.4 : 2} />
      </span>
      <span
        className="mt-1 text-[9.5px] font-semibold leading-none whitespace-nowrap"
        style={{ color: active ? '#FFFFFF' : '#8E8E93' }}
      >
        {label}
      </span>
    </button>
  );
}

export default function App() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => loadSettings().onboarded);
  const [hasSeenIntro, setHasSeenIntro] = useState(() => loadSettings().hasSeenIntro ?? false);
  const [userName, setUserName] = useState(() => loadSettings().userName);
  const [userCurrency, setUserCurrency] = useState(() => loadSettings().currency);
  const [monthlyBudget, setMonthlyBudget] = useState<number | undefined>(() => loadSettings().monthlyBudget);
  const [budgetNudgeDismissed, setBudgetNudgeDismissed] = useState<boolean>(() => !!loadSettings().budgetNudgeDismissed);
  // Currency for the transaction being added or edited. Seeded from the saved
  // setting rather than a hardcoded 'EUR', and re-seeded by the effect below
  // every time the Add screen opens for a new transaction.
  const [selectedTransactionCurrency, setSelectedTransactionCurrency] = useState(() => loadSettings().currency);
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'activity' | 'add' | 'trend' | 'settings'>('dashboard');
  // The shared scroll container for the non-activity tabs. Switching tabs must
  // start the new tab from the top (see the effect below).
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  // Post-import summary dialog - set only when the import has anything worth
  // reading (uncategorized rows or unreadable ones); clean imports stay a toast.
  const [importSummary, setImportSummary] = useState<ImportResult | null>(null);
  // An import whose file wants new subcategories, parked until the user has
  // approved or declined them on the review sheet. Nothing is committed while
  // this is set; cancelling drops the whole import.
  const [pendingImport, setPendingImport] = useState<ImportResult | null>(null);
  // One-shot filter preset for the Activity tab - the "Review in Activity"
  // button lands the user on the imported rows, pre-filtered.
  const [activityPreset, setActivityPreset] = useState<{
    typeFilter: string;
    year?: string;
    categoryFilter?: string;
  } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [recurrence, setRecurrence] = useState('Never repeat');
  const [date, setDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format using local time
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [expenses, setExpenses] = useState<Transaction[]>(loadTransactions);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>(() => loadRecurringRules());
  // Pending scope choices for edits/deletes of transactions in a recurring
  // chain ("only this one" vs "this and future ones").
  const [pendingRecurringEdit, setPendingRecurringEdit] = useState<{ id: string; values: Partial<Transaction> } | null>(null);
  // Offered right after a transaction is declared recurring: earlier one-off
  // copies of the same series (typically imported history) can join the new
  // chain in one tap instead of a dozen hand edits.
  const [pendingBackTag, setPendingBackTag] = useState<{ rule: RecurringRule; ids: string[]; name: string } | null>(null);
  // The same offer from the other direction: series set up long ago, history
  // imported afterwards. Checked on open and after imports; declining is
  // remembered per transaction so it never nags.
  const [pendingSeriesCleanup, setPendingSeriesCleanup] = useState<SeriesClaim[] | null>(null);
  // Occurrences the engine generated on top of transactions that already
  // existed, from before it learned to check. Offered for removal, generated
  // rows only.
  const [pendingDuplicates, setPendingDuplicates] = useState<Array<{ generated: Transaction; kept: Transaction }> | null>(null);
  const [pendingRecurringDelete, setPendingRecurringDelete] = useState<Transaction | null>(null);
  const [returnToTab, setReturnToTab] = useState<'dashboard' | 'activity' | 'trend' | 'settings' | 'add'>('dashboard'); // Track which tab to return to after editing
  // Set when a Trend month is tapped so the Overview opens on that period
  const [dashboardInitialPeriod, setDashboardInitialPeriod] = useState<{ month: number; year: number; type: 'expense' | 'income' } | null>(null);
  // The Overview's last view (period + drilldown), restored after an edit
  // round-trip; cleared by a deliberate tap on the Dashboard nav button.
  const dashboardViewRef = useRef<DashboardViewState | null>(null);
  // Trend's toggle + expanded category, so the refreshKey remounts App forces
  // (sync pull, recurrence on foreground) don't silently reset it to Expense.
  const trendViewRef = useRef<TrendViewState | null>(null);
  // Activity's filter bar and scroll position, restored after an edit
  // round-trip. Cleared below the moment the user lands on a tab that isn't
  // Activity or the editor.
  const activityViewRef = useRef<ActivityViewState | null>(null);
  const [categories, setCategories] = useState(loadCategories);
  const [incomeCategories, setIncomeCategories] = useState(loadIncomeCategories);
  // Payment sources (Cash / banks) + the source pre-selected per direction
  const [sources, setSources] = useState<Source[]>(loadSources);
  const [defaultSourceExpense, setDefaultSourceExpense] = useState(
    () => loadSettings().defaultSourceExpense || DEFAULT_SOURCE_EXPENSE
  );
  const [defaultSourceIncome, setDefaultSourceIncome] = useState(
    () => loadSettings().defaultSourceIncome || DEFAULT_SOURCE_INCOME
  );
  // First day of the week for the day-of-week breakdown: 1 Monday (default),
  // 0 Sunday, 6 Saturday.
  const [weekStartsOn, setWeekStartsOn] = useState<number>(() => loadSettings().weekStartsOn ?? 1);
  // The i18n store is initialised from settings in main.tsx, before this
  // renders; this state mirrors it so React owns persistence and sync.
  const [language, setAppLanguage] = useState<Language>(() => getLanguage());
  // The store must flip BEFORE the state does: setAppLanguage schedules the
  // re-render, and every t() in that render reads the store synchronously - an
  // effect would run one paint too late, leaving the whole app in the old
  // language until something else re-rendered it.
  const adoptLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    setAppLanguage(lang);
  }, []);
  // Belt and braces for any path that only touched the state.
  useEffect(() => {
    setLanguage(language);
  }, [language]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    () => loadSettings().defaultSourceExpense || DEFAULT_SOURCE_EXPENSE
  );
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [openSourcesOnSettings, setOpenSourcesOnSettings] = useState(false); // deep-link Settings → Sources
  const [openCategoriesOnSettings, setOpenCategoriesOnSettings] = useState(false); // deep-link Settings → Categories

  // Auth + cloud sync
  const { session, loading: authLoading, guest, signOut, deleteAccount, leaveGuest } = useAuth();
  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? null;
  // Google (and other OAuth providers) put the profile photo in user_metadata.
  const userMeta = (session?.user?.user_metadata ?? {}) as Record<string, any>;
  const userAvatar: string | null = userMeta.avatar_url || userMeta.picture || null;
  const [cloudHydrated, setCloudHydrated] = useState(false);
  // Set when the signed-in account is not the one this device's data belongs
  // to. While it is set, nothing syncs in either direction: the app shows a
  // choice instead (see the ownership gate in the render below).
  const [ownerConflict, setOwnerConflict] = useState<{ email: string | null } | null>(null);
  // Bumped by the gate's "start fresh" choice to re-run the hydrate effect
  // after the local data has been cleared.
  const [hydrateTick, setHydrateTick] = useState(0);
  // Honest sync indicator: pending while a write is debounced/in flight,
  // offline/error when the last attempt could not reach the server.
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'offline' | 'error'>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncRetryTick, setSyncRetryTick] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false); // Track if any modal is open
  const [isSaving, setIsSaving] = useState(false); // Track if save is in progress to prevent duplicate submissions
  
  // Track original values for change detection
  const [originalValues, setOriginalValues] = useState<{
    amount: string;
    description: string;
    date: string;
    category: string | null;
    subcategory: string | null;
    type: 'expense' | 'income';
    currency: string;
    recurrence: string;
    sourceId: string | null;
  } | null>(null);

  // Persist app data whenever it changes
  useEffect(() => {
    saveTransactions(expenses);
  }, [expenses]);
  useEffect(() => {
    saveCategories(categories);
  }, [categories]);
  useEffect(() => {
    saveIncomeCategories(incomeCategories);
  }, [incomeCategories]);
  useEffect(() => {
    saveSources(sources);
  }, [sources]);
  useEffect(() => {
    saveRecurringRules(recurringRules);
  }, [recurringRules]);
  // Start each tab from the top when switching in the nav bar, rather than
  // inheriting the previous tab's scroll position. Reset both the shared
  // scroll container and the window (whichever actually scrolls).
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [currentTab]);
  // The Add screen always opens in the user's own currency.
  //
  // This used to be seeded by the "+" button and nowhere else, so every other
  // way in arrived on whatever was last used - and on a fresh install that was
  // a hardcoded EUR. Someone who chose another currency during setup and then
  // followed the first-run nudge got a form denominated in euros, and only the
  // SECOND transaction came out right. Doing it here covers every route in,
  // including any added later.
  //
  // Editing is the exception: a transaction keeps the currency it was recorded
  // in, which is set on the way into the form.
  useEffect(() => {
    if (currentTab !== 'add' || editingExpenseId) return;
    setSelectedTransactionCurrency(userCurrency);
  }, [currentTab, editingExpenseId, userCurrency]);
  useEffect(() => {
    saveSettings({
      onboarded: hasCompletedOnboarding,
      userName,
      currency: userCurrency,
      monthlyBudget,
      budgetNudgeDismissed,
      hasSeenIntro,
      defaultSourceExpense,
      defaultSourceIncome,
      weekStartsOn,
      language,
    });
  }, [hasCompletedOnboarding, userName, userCurrency, monthlyBudget, budgetNudgeDismissed, hasSeenIntro, defaultSourceExpense, defaultSourceIncome, weekStartsOn, language]);

  // Warm the tab chunks once the first screen has settled. Deliberately on an
  // idle callback with a timeout rather than straight after mount: the point
  // is to use spare time, not to compete with the render the user is waiting
  // for. The timeout is the floor for a device that never goes idle.
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prefetchTabs, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetchTabs, 2000);
    return () => window.clearTimeout(id);
  }, []);

  // Activity's filters and scroll position should outlive opening a
  // transaction but not leaving the tab. Editing routes through 'add' and comes straight back, so 'add' is not
  // a departure - landing on any other tab is, and drops the snapshot so the
  // next visit starts unfiltered.
  useEffect(() => {
    if (currentTab !== 'activity' && currentTab !== 'add') activityViewRef.current = null;
    // Same rule for Trend: a deliberate tab change resets it to Expense, an
    // in-tab remount does not. 'add' is exempt for symmetry with Activity.
    if (currentTab !== 'trend' && currentTab !== 'add') trendViewRef.current = null;
  }, [currentTab]);

  // When opening a NEW transaction, pre-select the current default source for
  // the active type — so changing the default in Settings takes effect
  // immediately (without needing to toggle expense/income).
  useEffect(() => {
    if (currentTab === 'add' && !editingExpenseId) {
      setSelectedSourceId(transactionType === 'income' ? defaultSourceIncome : defaultSourceExpense);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab]);

  // What the server held the last time this device agreed with it, and the
  // stamp identifying that version. Together they let a write say "only if
  // nothing has changed since", and give the merge a starting point to tell an
  // addition apart from a deletion.
  const cloudBaseRef = useRef<SyncPayload | null>((loadSyncBase()?.payload as SyncPayload) ?? null);
  const cloudVersionRef = useRef<string | null>(loadSyncBase()?.version ?? null);
  // Keep the refs and their persisted copy in step - the persisted one is what
  // makes the NEXT launch able to merge rather than overwrite.
  const rememberSyncBase = useCallback((payload: SyncPayload | null, version: string | null) => {
    cloudBaseRef.current = payload;
    cloudVersionRef.current = version;
    saveSyncBase(payload ? { payload, version } : null);
  }, []);
  // Current local state, readable from callbacks that are not re-created on
  // every render (the visibility listener below).
  const localPayloadRef = useRef<SyncPayload | null>(null);
  const cloudHydratedRef = useRef(false);
  const pullingRef = useRef(false);
  // Fires the pending cloud write immediately, set by the save effect below.
  const flushSaveRef = useRef<(() => void) | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  // Snapshot the whole app state into the cloud payload shape
  const buildPayload = (): SyncPayload => ({
    transactions: expenses,
    recurringRules,
    categories,
    incomeCategories,
    sources,
    settings: {
      onboarded: hasCompletedOnboarding,
      userName,
      currency: userCurrency,
      monthlyBudget,
      budgetNudgeDismissed,
      hasSeenIntro,
      defaultSourceExpense,
      defaultSourceIncome,
      weekStartsOn,
      language,
    },
  });

  // Push a payload into React state. Used both by the initial hydrate and by
  // the foreground refresh, so the two can never drift apart.
  const applyPayload = useCallback((p: SyncPayload) => {
    setExpenses(p.transactions ?? []);
    setRecurringRules(p.recurringRules ?? []);
    setCategories(p.categories ?? initialCategories);
    setIncomeCategories(p.incomeCategories ?? initialIncomeCategories);
    setSources(p.sources?.length ? p.sources : DEFAULT_SOURCES);
    const s = p.settings ?? ({} as SyncPayload['settings']);
    setHasCompletedOnboarding(!!s.onboarded);
    setUserName(s.userName ?? '');
    setUserCurrency(s.currency ?? 'EUR');
    setMonthlyBudget(s.monthlyBudget);
    setBudgetNudgeDismissed(!!s.budgetNudgeDismissed);
    setHasSeenIntro(!!s.hasSeenIntro);
    setDefaultSourceExpense(s.defaultSourceExpense ?? DEFAULT_SOURCE_EXPENSE);
    setDefaultSourceIncome(s.defaultSourceIncome ?? DEFAULT_SOURCE_INCOME);
    setWeekStartsOn(s.weekStartsOn ?? 1);
    // Absent means English, deliberately - never the device guess: an account
    // that predates the language choice must not flip because the phone is
    // Italian.
    adoptLanguage(s.language === 'it' ? 'it' : 'en');
  }, [adoptLanguage]);

  // Keep the ref holding current local state fresh, for the listeners below
  // that are registered once and never see a later render's closure.
  useEffect(() => {
    localPayloadRef.current = buildPayload();
  });
  useEffect(() => {
    cloudHydratedRef.current = cloudHydrated;
  }, [cloudHydrated]);

  // On sign-in: load the user's cloud data into state; if the account has none
  // yet, push the current (local) data up — a one-time migration on first login.
  useEffect(() => {
    if (!userId) {
      setCloudHydrated(false);
      setOwnerConflict(null);
      rememberSyncBase(null, null);
      return;
    }
    // Whose data is on this device? If it belongs to a different account, stop
    // before any cloud call: adopting it would upload one person's ledger into
    // another person's row (found live: a second sign-in with another email
    // walked away with a full copy of the first account's data). cloudHydrated
    // stays false, which keeps every save and pull inert while the gate asks.
    const owner = loadOwner();
    if (owner && owner.id !== userId) {
      setOwnerConflict({ email: owner.email });
      return;
    }
    setOwnerConflict(null);
    // Stamp before the network, not after: even if this attach never reaches
    // the server (offline first sign-in), the data is now this account's, and
    // a later sign-in by someone else must see that.
    saveOwner({ id: userId, email: userEmail });
    let cancelled = false;
    (async () => {
      try {
        const cloud = await loadCloud(userId);
        if (cancelled) return;
        if (cloud) {
          // Merge, don't replace. This used to assign the cloud's payload
          // straight into state, which silently threw away anything added
          // while offline and never synced - the local copy was treated as
          // disposable even though it is the one the user has been using.
          const merged = mergePayloads(cloudBaseRef.current, buildPayload(), cloud.payload);
          applyPayload(merged);
          rememberSyncBase(cloud.payload, cloud.version);
        } else {
          const local = buildPayload();
          const res = await saveCloudChecked(userId, local, null);
          if (res.ok) rememberSyncBase(local, res.version);
          // A conflict here means another device created the row a moment ago.
          // Leave the base empty; the first save will see the mismatch, pull
          // and merge rather than overwrite.
        }
      } catch {
        // Sync unavailable (offline / policy) — fall back to local data
      } finally {
        if (!cancelled) {
          setRefreshKey((prev) => prev + 1);
          setCloudHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hydrateTick]);

  // Write changes back to the cloud (debounced), once hydrated.
  //
  // The write is conditional on the server still holding the version we last
  // saw. If it doesn't, another device wrote in the meantime: pull what it
  // wrote, merge, and try again - rather than overwriting it, which is what
  // this used to do.
  useEffect(() => {
    if (!userId || !cloudHydrated) return;
    setSyncStatus('pending');
    let cancelled = false;

    const push = async () => {
      // Up to three passes: a busy second device can win the race more than
      // once, but each pass starts from its newer data, so this converges.
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        const payload = buildPayload();
        const res = await saveCloudChecked(userId, payload, cloudVersionRef.current);
        if (res.ok) {
          rememberSyncBase(payload, res.version);
          // Re-stamp: "erase all data" clears the owner mark along with the
          // data, but the same signed-in account writing again owns what it
          // writes. A no-op when the stamp is already right.
          saveOwner({ id: userId, email: userEmail });
          return true;
        }
        const remote = await loadCloud(userId);
        if (cancelled) return false;
        if (!remote) {
          cloudVersionRef.current = null; // row vanished (erased elsewhere)
          continue;
        }
        const merged = mergePayloads(cloudBaseRef.current, payload, remote.payload);
        rememberSyncBase(remote.payload, remote.version);
        // Applying the merge re-runs this effect, which writes it back.
        applyPayload(merged);
        setRefreshKey((prev) => prev + 1);
        return true;
      }
      return false;
    };

    let fired = false;
    const run = () => {
      if (fired || cancelled) return;
      fired = true;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSyncStatus('offline');
        return; // the 'online' listener below retries automatically
      }
      push()
        .then((done) => {
          if (cancelled) return;
          if (done) {
            setSyncStatus('synced');
            setLastSyncedAt(Date.now());
          } else {
            setSyncStatus('error');
          }
        })
        .catch(() => {
          if (!cancelled) setSyncStatus('error');
        });
    };

    const t = setTimeout(run, 800);
    // Closing the tab or backgrounding the app throws away a debounce that has
    // not fired yet. Nothing is lost - the next launch merges the change up -
    // but "not lost" is not the same as "on my other device ten seconds later",
    // so hand the listeners below a way to fire it early.
    flushSaveRef.current = () => {
      clearTimeout(t);
      run();
    };
    return () => {
      cancelled = true;
      clearTimeout(t);
      flushSaveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  // budgetNudgeDismissed is in the payload, so it belongs in the deps -
  // without it, dismissing the nudge didn't sync until the next unrelated
  // change, and a re-hydrate on another device could re-show the card.
  }, [userId, cloudHydrated, syncRetryTick, expenses, recurringRules, categories, incomeCategories, sources, hasCompletedOnboarding, userName, userCurrency, monthlyBudget, budgetNudgeDismissed, hasSeenIntro, defaultSourceExpense, defaultSourceIncome, weekStartsOn, language]);

  // Coming back to the app pulls anything another device wrote while we were
  // away. Previously returning to the foreground only ever pushed, so a device
  // left open for days kept writing over newer data it had never seen.
  //
  // Costs one small request: the version stamp alone, a few bytes. The dataset
  // itself is only downloaded when that stamp has actually moved.
  const pullRemote = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || !cloudHydratedRef.current || pullingRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    pullingRef.current = true;
    try {
      const version = await loadCloudVersion(uid);
      // sameVersion, not ===: the server hands our own stamp back in a
      // different text form, and a string compare made every poll believe
      // another device had written (see cloud.ts).
      if (!version || sameVersion(version, cloudVersionRef.current)) return; // nothing new
      const remote = await loadCloud(uid);
      if (!remote) return;
      const local = localPayloadRef.current ?? remote.payload;
      const merged = mergePayloads(cloudBaseRef.current, local, remote.payload);
      rememberSyncBase(remote.payload, remote.version);
      // A pull that changes nothing must not touch the UI. Dashboard and Trend
      // are keyed on refreshKey, so applying an identical payload remounts
      // both - the charts blank and redraw - and hands the save effect fresh
      // state to push, which gives the next poll something to find.
      if (samePayload(merged, local)) return;
      applyPayload(merged);
      setRefreshKey((prev) => prev + 1);
    } catch {
      // Offline or unreachable - keep using local data, try again next time.
    } finally {
      pullingRef.current = false;
    }
  }, [applyPayload]);

  // Leaving pushes what is pending, rather than letting the debounce die with
  // the page. Registered once: it reads whatever the save effect last stored.
  useEffect(() => {
    const flush = () => flushSaveRef.current?.();
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    // pagehide covers an actual close/navigate, which never reports 'hidden'
    // on some browsers.
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  // An app that stays open and visible never fires visibilitychange, so two
  // apps side by side were deaf to each other until one was backgrounded.
  // Poll the version stamp while visible - loadCloudVersion is a few bytes,
  // and pullRemote already skips the download when the stamp hasn't moved.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pullRemote();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [pullRemote]);

  // Coming back online (or refocusing after a failed save) retries the sync.
  useEffect(() => {
    const retry = () => setSyncRetryTick((t) => t + 1);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void pullRemote();
      retry();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pullRemote]);

  // Recurring transactions: materialize any occurrence whose scheduled day has
  // arrived - on open (after the data source is settled) and whenever the app
  // returns to the foreground, so missed days are back-filled.
  const expensesRef = useRef(expenses);
  useEffect(() => {
    expensesRef.current = expenses;
  }, [expenses]);
  const rulesRef = useRef(recurringRules);
  useEffect(() => {
    rulesRef.current = recurringRules;
  }, [recurringRules]);
  const runRecurrence = useCallback(() => {
    const res = processRecurrence(expensesRef.current, rulesRef.current);
    if (res.rulesChanged) setRecurringRules(res.rules);
    if (res.txnsChanged) {
      setExpenses(res.transactions);
      setRefreshKey((prev) => prev + 1);
    }
    if (res.createdCount > 0) {
      toast.success(t(res.createdCount === 1 ? 'toast.recAdded.one' : 'toast.recAdded.other', { n: res.createdCount }), {
        duration: 2000,
      });
    }
  }, []);
  // Untagged history behind the existing rules: an import drops a year of
  // "Monthly rent" one-offs behind a series that was set up long ago, so the
  // "declare it recurring" moment - which is when the other offer fires -
  // never comes. Reads refs, so the import path can call it right after
  // setting state and still see the fresh rows.
  const offerSeriesCleanup = useCallback(() => {
    const dismissed = new Set(loadBackTagDismissed());
    // Duplicates first: they are damage, and the other offer is only tidying.
    const dupes = findGeneratedDuplicates(expensesRef.current, rulesRef.current)
      .filter((d) => !dismissed.has(d.generated.id));
    if (dupes.length > 0) {
      setPendingDuplicates(dupes);
      return;
    }
    const claims = findUnclaimedSeriesRows(expensesRef.current, rulesRef.current)
      .map((c) => ({ ...c, rows: c.rows.filter((r) => !dismissed.has(r.id)) }))
      .filter((c) => c.rows.length > 0);
    if (claims.length > 0) setPendingSeriesCleanup(claims);
  }, []);

  const recurrenceReady = userId ? cloudHydrated : guest;
  const cleanupOfferedThisLaunch = useRef(false);
  useEffect(() => {
    if (!recurrenceReady) return;
    runRecurrence();
    const onVisible = () => {
      if (document.visibilityState === 'visible') runRecurrence();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Once per launch, after the open has settled - not on every foreground,
    // which would put a dialog over whatever the user came back to do.
    let cleanupTimer: number | undefined;
    if (!cleanupOfferedThisLaunch.current) {
      cleanupOfferedThisLaunch.current = true;
      cleanupTimer = window.setTimeout(offerSeriesCleanup, 2000);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (cleanupTimer) window.clearTimeout(cleanupTimer);
    };
  }, [recurrenceReady, runRecurrence, offerSeriesCleanup]);

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedSubcategory(null); // Reset subcategory when category changes
  };

  const handleEditExpense = (expenseId: string) => {
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;

    // Store which tab we're coming from so we can return to it
    setReturnToTab(currentTab);

    // Set transaction type first, then other form data
    setTransactionType(expense.type || 'expense');
    setAmount(expense.amount.toString());
    setDescription(expense.description);
    setDate(expense.date);
    setSelectedCategory(expense.category.id);
    setSelectedSubcategory(expense.subcategory || null);
    setSelectedTransactionCurrency(expense.currency || userCurrency); // Set currency for current transaction
    setRecurrence(expense.recurrence || 'Never repeat');
    setSelectedSourceId(expense.sourceId || defaultSourceFor(expense.type || 'expense'));

    // Store original values for change detection
    setOriginalValues({
      amount: expense.amount.toString(),
      description: expense.description,
      date: expense.date,
      category: expense.category.id,
      subcategory: expense.subcategory || null,
      type: expense.type || 'expense',
      currency: expense.currency || userCurrency,
      recurrence: expense.recurrence || 'Never repeat',
      sourceId: expense.sourceId || null
    });
    
    // Set editing mode and open modal
    setEditingExpenseId(expenseId);
    setCurrentTab('add');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    // Reset form
    setAmount('');
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setDescription('');
    setTransactionType('expense'); // Reset to default expense type
    setSelectedSourceId(defaultSourceExpense); // Reset to the expense default source
    setRecurrence('Never repeat'); // Reset recurrence
    setDate(() => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    });
    setEditingExpenseId(null);
    setOriginalValues(null);
    setCurrentTab(returnToTab); // Return to the tab that was active before editing
    setIsModalOpen(false);
  };

  const handleSave = () => {
    // Prevent duplicate submissions
    if (isSaving) return;
    
    if (!amount || parseFloat(amount) === 0) {
      toast.error(t('toast.amountRequired'));
      return;
    }

    if (!selectedCategory) {
      toast.error(t('toast.categoryRequired'));
      return;
    }

    // Set saving state to prevent duplicate clicks
    setIsSaving(true);

    // Get category data from the correct source based on transaction type
    const categoryData = activeCategories.find(c => c.id === selectedCategory);
    
    // Store whether we're editing before resetting the state
    const wasEditing = !!editingExpenseId;
    
    if (editingExpenseId) {
      const values: Partial<Transaction> = {
        description: description || categoryData?.name || (transactionType === 'expense' ? 'Expense' : 'Income'),
        amount: parseFloat(amount),
        category: categoryData!,
        subcategory: selectedSubcategory || undefined,
        date: date,
        type: transactionType,
        currency: selectedTransactionCurrency, // Update currency when editing
        baseAmount: convertAmount(parseFloat(amount), selectedTransactionCurrency, BASE_CURRENCY), // lock FX value
        recurrence: recurrence,
        sourceId: selectedSourceId || undefined,
        updatedAt: new Date().toISOString()
      };
      const current = expenses.find((e) => e.id === editingExpenseId);
      const chainRule = current?.recurrenceOf
        ? recurringRules.find((r) => r.id === current.recurrenceOf && isActiveRule(r))
        : undefined;

      if (current && chainRule) {
        if (recurrence !== chainRule.rule) {
          // Changing the schedule itself is inherently a "from here on" edit.
          applyRecurringFuture(current, chainRule, values);
        } else {
          // Ask: only this occurrence, or this and future ones?
          setPendingRecurringEdit({ id: current.id, values });
          setIsSaving(false);
          return; // stay on the edit screen until the user chooses
        }
      } else {
        setExpenses(expenses.map(expense =>
          expense.id === editingExpenseId ? { ...expense, ...values } : expense
        ));
        // A plain transaction can be given a schedule via editing: that makes
        // it the first occurrence of a brand-new chain.
        if (recurrence !== 'Never repeat') {
          const rule: RecurringRule = {
            id: newRuleId(),
            rule: recurrence,
            anchorDate: date,
            template: templateFromValues(values),
          };
          setRecurringRules((prev) => [...prev, rule]);
          setExpenses((prev) => prev.map((e) => (e.id === editingExpenseId ? { ...e, recurrenceOf: rule.id } : e)));
          const matches = findPastSeriesMatches(expenses, {
            id: editingExpenseId,
            description: values.description!,
            category: categoryData!,
            type: transactionType,
            date,
          });
          if (matches.length > 0) setPendingBackTag({ rule, ids: matches.map((m) => m.id), name: values.description! });
        }
      }

      // Force refresh
      setRefreshKey(prev => prev + 1);
      
      toast.success(t(transactionType === 'expense' ? 'toast.expenseUpdated' : 'toast.incomeUpdated'), {
        duration: 1400,
      });
    } else {
      // Create new transaction with current currency
      const newExpense: Transaction = {
        id: `${transactionType}-${Date.now()}`,
        description: description || categoryData?.name || (transactionType === 'expense' ? 'Expense' : 'Income'),
        amount: parseFloat(amount),
        category: categoryData!,
        subcategory: selectedSubcategory || undefined,
        date: date,
        type: transactionType,
        currency: selectedTransactionCurrency, // Store the currency with the transaction
        baseAmount: convertAmount(parseFloat(amount), selectedTransactionCurrency, BASE_CURRENCY), // lock FX value
        recurrence: recurrence, // Add recurrence
        sourceId: selectedSourceId || undefined,
        updatedAt: new Date().toISOString()
      };

      // A recurrence choice on a new transaction starts a chain: the rule's
      // template is stamped onto future occurrences by the engine.
      if (recurrence !== 'Never repeat') {
        const rule: RecurringRule = {
          id: newRuleId(),
          rule: recurrence,
          anchorDate: date,
          template: buildRuleTemplate(newExpense),
        };
        newExpense.recurrenceOf = rule.id;
        setRecurringRules((prev) => [...prev, rule]);
        const matches = findPastSeriesMatches(expenses, newExpense);
        if (matches.length > 0) setPendingBackTag({ rule, ids: matches.map((m) => m.id), name: newExpense.description });
      }

      // Add to expenses list
      setExpenses([newExpense, ...expenses]);
      track('transaction_added', { type: transactionType, hasSource: !!selectedSourceId });
      
      // Force refresh of Dashboard and Activity
      setRefreshKey(prev => prev + 1);

      // Success feedback with navigation option
      const categoryName = categoryData?.name;
      const currencyData = CURRENCIES[selectedTransactionCurrency] || CURRENCIES.EUR;
      // Symbol after the number, like every amount the app shows.
      const sep = currencyData.symbol.length > 1 ? ' ' : '';
      const formattedToastAmount = `${amount}${sep}${currencyData.symbol}`;


      toast.success(t('toast.saved', { amt: formattedToastAmount, cat: categoryName ?? '' }), {
        duration: 1400,
      });
    }
    
    finishAddFlow(wasEditing);
  };

  // Return to the tab we came from when editing, or go to dashboard for new
  // transactions; then reset the form. Shared by the direct save path and the
  // recurring scope dialog.
  const finishAddFlow = (wasEditing: boolean) => {
    setTimeout(() => {
      setCurrentTab(wasEditing ? returnToTab : 'dashboard');
      setIsModalOpen(false);
      
      // Reset form after modal closes
      setAmount('');
      setSelectedCategory(null);
      setSelectedSubcategory(null);
      setDescription('');
      setTransactionType('expense'); // Reset to default expense type
      setRecurrence('Never repeat'); // Reset recurrence
      setDate(() => {
        // Reset to today's date in YYYY-MM-DD format using local time
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      });
      setEditingExpenseId(null);
      setOriginalValues(null);
      setIsSaving(false); // Reset saving state
    }, 500);
  };

  // Category CRUD handlers
  const handleAddCategory = (category: Omit<typeof categories[0], 'id'>) => {
    const newCategory = {
      ...category,
      id: `category-${Date.now()}`,
      updatedAt: new Date().toISOString()
    };
    setCategories([...categories, newCategory]);
    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.catAdded'), {
      duration: 1400,
    });
  };

  const handleEditCategory = (id: string, updatedCategory: Omit<typeof categories[0], 'id'>) => {
    const editedAt = new Date().toISOString();
    setCategories(categories.map(cat => 
      cat.id === id ? { ...updatedCategory, id, updatedAt: editedAt } : cat
    ));
    
    // Update existing expenses that use this category
    setExpenses(expenses.map(expense => 
      expense.category.id === id 
        ? { ...expense, category: { ...updatedCategory, id, updatedAt: editedAt }, updatedAt: editedAt }
        : expense
    ));
    
    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.catUpdated'), {
      duration: 1400,
    });
  };

  const handleDeleteCategory = (id: string) => {
    const deleted = categories.find((c) => c.id === id);
    if (!deleted) return;
    // Move its transactions to "Others" so nothing is orphaned.
    const { cats, txns } = reassignToOthers(deleted, categories, expenses);
    setCategories(cats);
    setExpenses(txns);
    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.catDeleted'), {
      duration: 1400,
    });
  };

  // The income tab of Manage Categories renders the same subcategory UI as the
  // expense tab, so these three handlers receive ids from either list. Route by
  // whichever list owns the id - income ids ("salary", "income-category-…")
  // never collide with expense ones. Mapping over `categories` unconditionally
  // meant every income subcategory edit matched nothing, changed nothing, and
  // still toasted success.
  const editSubcategories = (categoryId: string, update: (subs: string[]) => string[]) => {
    const setList = incomeCategories.some((c) => c.id === categoryId)
      ? setIncomeCategories
      : setCategories;
    setList((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? { ...cat, subcategories: update(cat.subcategories || []), updatedAt: new Date().toISOString() }
          : cat
      )
    );
  };

  const handleAddSubcategory = (categoryId: string, subcategoryName: string) => {
    editSubcategories(categoryId, (subs) => [...subs, subcategoryName]);
    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.subAdded'), {
      duration: 1400,
    });
  };

  const handleEditSubcategory = (categoryId: string, oldName: string, newName: string) => {
    editSubcategories(categoryId, (subs) => subs.map(sub => sub === oldName ? newName : sub));

    // Re-label the transactions carrying the old name. Already type-agnostic:
    // the category id pins which direction this is.
    setExpenses(expenses.map(expense =>
      expense.category.id === categoryId && expense.subcategory === oldName
        ? { ...expense, subcategory: newName, updatedAt: new Date().toISOString() }
        : expense
    ));

    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.subUpdated'), {
      duration: 1400,
    });
  };

  const handleDeleteSubcategoryHandler = (categoryId: string, subcategoryName: string) => {
    editSubcategories(categoryId, (subs) => subs.filter(sub => sub !== subcategoryName));

    // Strip the subcategory from its transactions, keeping the transactions.
    setExpenses(expenses.map(expense =>
      expense.category.id === categoryId && expense.subcategory === subcategoryName
        ? { ...expense, subcategory: undefined, updatedAt: new Date().toISOString() }
        : expense
    ));

    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.subDeleted'), {
      duration: 1400,
    });
  };

  // Income Category CRUD handlers
  const handleAddIncomeCategory = (category: Omit<typeof incomeCategories[0], 'id'>) => {
    const newCategory = {
      ...category,
      id: `income-category-${Date.now()}`,
      updatedAt: new Date().toISOString()
    };
    setIncomeCategories([...incomeCategories, newCategory]);
    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.incCatAdded'), {
      duration: 1400,
    });
  };

  const handleEditIncomeCategory = (id: string, updatedCategory: Omit<typeof incomeCategories[0], 'id'>) => {
    const editedAt = new Date().toISOString();
    setIncomeCategories(incomeCategories.map(cat => 
      cat.id === id ? { ...updatedCategory, id, updatedAt: editedAt } : cat
    ));
    
    // Update existing income transactions that use this category
    setExpenses(expenses.map(expense => 
      expense.type === 'income' && expense.category.id === id 
        ? { ...expense, category: { ...updatedCategory, id, updatedAt: editedAt }, updatedAt: editedAt }
        : expense
    ));
    
    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.incCatUpdated'), {
      duration: 1400,
    });
  };

  const handleDeleteIncomeCategory = (id: string) => {
    const deleted = incomeCategories.find((c) => c.id === id);
    if (!deleted) return;
    // Reassign its income transactions to an "Others" income bucket (created if
    // needed) rather than deleting them, so no data is lost.
    const { cats, txns } = reassignToOthers(deleted, incomeCategories, expenses);
    setIncomeCategories(cats);
    setExpenses(txns);
    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.incCatDeleted'), {
      duration: 1400,
    });
  };

  const handleDeleteExpense = (id: string) => {
    const txn = expenses.find((e) => e.id === id);
    const chainRule = txn?.recurrenceOf
      ? recurringRules.find((r) => r.id === txn.recurrenceOf && isActiveRule(r))
      : undefined;
    if (txn && chainRule) {
      // Recurring: ask whether to delete just this occurrence or stop the chain.
      setPendingRecurringDelete(txn);
      return;
    }
    setExpenses(expenses.filter(expense => expense.id !== id));
    setRefreshKey(prev => prev + 1);
    toast.success(t('toast.txDeleted'), {
      duration: 1400,
    });
  };
  
  // Get the correct categories based on transaction type
  const activeCategories = transactionType === 'expense' ? categories : incomeCategories;
  const selectedCategoryData = activeCategories.find(c => c.id === selectedCategory);
  const subcategories = selectedCategoryData?.subcategories || [];
  
  // The source pre-selected for a given direction
  const defaultSourceFor = (type: 'expense' | 'income') =>
    type === 'income' ? defaultSourceIncome : defaultSourceExpense;

  // Handle transaction type switch
  const handleTransactionTypeChange = (newType: 'expense' | 'income') => {
    setTransactionType(newType);
    // Reset category selection when switching types
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    // Move to the default source for the new direction
    setSelectedSourceId(defaultSourceFor(newType));
  };

  // Check if anything has changed (for edit mode)
  const hasChanges = editingExpenseId && originalValues
    ? amount !== originalValues.amount ||
      description !== originalValues.description ||
      date !== originalValues.date ||
      selectedCategory !== originalValues.category ||
      selectedSubcategory !== originalValues.subcategory ||
      selectedTransactionCurrency !== originalValues.currency ||
      recurrence !== originalValues.recurrence ||
      (selectedSourceId || null) !== (originalValues.sourceId || null)
    : true;
  
  const canSave = amount && parseFloat(amount) > 0 && selectedCategory && hasChanges;

  // True when editing an occurrence the recurrence engine created (not the
  // seed) - the edit screen shows a small provenance hint for these.
  const editingAutoOccurrence =
    !!editingExpenseId &&
    editingExpenseId.startsWith('rec-') &&
    !!expenses.find((e) => e.id === editingExpenseId)?.recurrenceOf;

  // ---- Recurring-chain edit/delete helpers (calendar-style scopes) ----

  const templateFromValues = (v: Partial<Transaction>) => buildRuleTemplate(v as Transaction);

  // "Only this transaction": the row changes, the schedule doesn't.
  const applyRecurringOnlyThis = (id: string, values: Partial<Transaction>) => {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...values } : e)));
  };

  // "This and future ones". The whole rewrite lives in lib/recurrence next to
  // the engine that materializes occurrences, because the two have to agree
  // about occurrence ids - when they disagreed, every future occurrence was
  // duplicated on the next open.
  const applyRecurringFuture = (current: Transaction, rule: RecurringRule, values: Partial<Transaction>) => {
    const res = applyFutureEdit(expensesRef.current, rulesRef.current, current, rule, values);
    setExpenses(res.transactions);
    setRecurringRules(res.rules);
  };

  const confirmRecurringEdit = (scope: 'one' | 'future') => {
    const pending = pendingRecurringEdit;
    if (!pending) return;
    const current = expenses.find((e) => e.id === pending.id);
    const rule = current?.recurrenceOf ? recurringRules.find((r) => r.id === current.recurrenceOf) : undefined;
    if (current && rule) {
      if (scope === 'one') applyRecurringOnlyThis(pending.id, pending.values);
      else applyRecurringFuture(current, rule, pending.values);
    }
    setPendingRecurringEdit(null);
    setRefreshKey((prev) => prev + 1);
    toast.success(t('toast.txUpdated'), { duration: 1400 });
    finishAddFlow(true);
  };

  const confirmRecurringDelete = (scope: 'one' | 'future') => {
    const t = pendingRecurringDelete;
    if (!t) return;
    const rule = recurringRules.find((r) => r.id === t.recurrenceOf);
    if (rule) {
      const cutoff = occurrenceDueDate(t, rule);
      if (scope === 'one') {
        // Remember the deleted occurrence so the engine never regenerates it.
        if (t.id.startsWith(`rec-${rule.id}-`)) {
          setRecurringRules((prev) =>
            prev.map((r) => (r.id === rule.id ? { ...r, skipDates: [...(r.skipDates ?? []), cutoff] } : r)),
          );
        }
        setExpenses((prev) => prev.filter((e) => e.id !== t.id));
      } else {
        setRecurringRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, endedAt: cutoff } : r)));
        setExpenses((prev) =>
          prev.filter((e) => !(e.id === t.id || (e.recurrenceOf === rule.id && occurrenceDueDate(e, rule) >= cutoff))),
        );
      }
    } else {
      setExpenses((prev) => prev.filter((e) => e.id !== t.id));
    }
    setPendingRecurringDelete(null);
    setRefreshKey((prev) => prev + 1);
    toast.success(scope === 'one' ? 'Transaction deleted' : 'Deleted - schedule stopped', { duration: 1600 });
  };

  const handleOnboardingComplete = (name: string, currency: string, lang: Language) => {
    setUserName(name);
    setUserCurrency(currency);
    adoptLanguage(lang);
    // Seed the starter catalogue in the chosen language. Onboarding only ever
    // runs on a fresh account (a returning cloud user skips it), so what's
    // being replaced is the untouched default set, never the user's own work.
    // This is the ONLY moment names follow the language: from here on,
    // categories and sources are the user's data, and switching the app
    // language later must not rename them (an Italian user may well keep
    // "Travel" - that's their call, not the translator's).
    setCategories(defaultCategoriesFor(lang));
    setIncomeCategories(defaultIncomeCategoriesFor(lang));
    setSources(defaultSourcesFor(lang));
    setHasCompletedOnboarding(true);
    track('onboarding_completed', { currency, language: lang });
  };

  // Demo data (for testing) — date-shifted samples, each with a random source
  // so the field is populated. Added ON TOP of the user's own data (never
  // replacing it): demo rows carry a `demo-` id prefix, so "Erase demo data"
  // removes only them and the real data is untouched. Re-loading first drops any
  // existing demo rows so it stays idempotent.
  const handleLoadDemoData = () => {
    const demo = getDemoTransactions(userCurrency, [...categories, ...incomeCategories]).map((t) => ({
      ...t,
      sourceId: sources.length
        ? sources[Math.floor(Math.random() * sources.length)].id
        : undefined,
    }));
    setExpenses((prev) => [...demo, ...prev.filter((e) => !e.id.startsWith('demo-'))]);
    setRefreshKey(prev => prev + 1);
    setCurrentTab('dashboard');
    track('demo_loaded');
    toast.success(t('toast.demoLoaded'), {
      description: t('toast.demoLoadedDesc'),
      duration: 1600,
    });
  };

  // Demo transactions carry a `demo-` id prefix, so they can be removed on
  // their own without touching the user's real data.
  const hasDemoData = expenses.some((e) => e.id.startsWith('demo-'));
  const handleEraseDemoData = () => {
    setExpenses((prev) => prev.filter((e) => !e.id.startsWith('demo-')));
    setRefreshKey((prev) => prev + 1);
    setCurrentTab('dashboard');
    toast.success(t('toast.demoRemoved'), { duration: 1400 });
  };

  // Export everything as a single backup file: settings, categories,
  // subcategories, sources and all transactions. Re-importable via restore.
  const handleExportData = () => {
    try {
      downloadBackup(
        buildBackup({
          userName,
          currency: userCurrency,
          monthlyBudget,
          budgetNudgeDismissed,
          defaultSourceExpense,
          defaultSourceIncome,
          categories,
          incomeCategories,
          sources,
          transactions: expenses,
          recurringRules,
        })
      );
      track('data_exported', { count: expenses.length });
      toast.success(t('toast.backupExported'), {
        description: t(expenses.length === 1 ? 'toast.backupExportedDesc.one' : 'toast.backupExportedDesc.other', { n: expenses.length }),
        duration: 2000,
      });
    } catch {
      toast.error(t('toast.exportFailed'));
    }
  };

  // Autocomplete under the Description field while ADDING (never editing -
  // there the description is already what the user made it). Computed from
  // existing transactions only; nothing new is stored.
  const descriptionSuggestions = useMemo<DescriptionSuggestion[]>(() => {
    if (editingExpenseId || currentTab !== 'add') return [];
    return buildDescriptionSuggestions(
      expenses,
      transactionType,
      description,
      transactionType === 'income' ? incomeCategories : categories,
      sources,
    );
  }, [editingExpenseId, currentTab, expenses, transactionType, description, categories, incomeCategories, sources]);

  // A pick fills the description and repeats the merchant's usual
  // category/subcategory/source. Amount, date, currency and recurrence are
  // deliberately untouched - those genuinely vary visit to visit.
  const handlePickSuggestion = (s: DescriptionSuggestion) => {
    setDescription(s.description);
    if (s.categoryId) {
      setSelectedCategory(s.categoryId);
      setSelectedSubcategory(s.subcategory);
    }
    if (s.sourceId) setSelectedSourceId(s.sourceId);
  };

  // Spreadsheet export: every transaction as CSV, for Excel / Sheets. The
  // JSON backup above is for TracklyLab itself; this one is for leaving the
  // app's world with your data readable anywhere.
  const handleExportCsv = () => {
    try {
      downloadTransactionsCsv(buildTransactionsCsv(expenses, userCurrency, sources));
      track('data_exported_csv', { count: expenses.length });
      toast.success(t('toast.csvExported'), {
        description: t(expenses.length === 1 ? 'toast.csvExportedDesc.one' : 'toast.csvExportedDesc.other', { n: expenses.length }),
        duration: 2000,
      });
    } catch {
      toast.error(t('toast.exportFailed'));
    }
  };

  // Restore a full backup produced by Export — replaces all current data.
  const restoreBackup = (b: any) => {
    const count = Array.isArray(b.transactions) ? b.transactions.length : 0;
    // Restoring says "THIS is my data, as of now" - re-stamp everything so the
    // restored copies outrank whatever stale copies other devices still hold.
    const restoredAt = new Date().toISOString();
    if (Array.isArray(b.transactions))
      setExpenses(b.transactions.map((t: Transaction) => ({ ...t, updatedAt: restoredAt })));
    setRecurringRules(Array.isArray(b.recurringRules) ? b.recurringRules : []);
    if (Array.isArray(b.categories))
      setCategories(b.categories.map((c: Category) => ({ ...c, updatedAt: restoredAt })));
    if (Array.isArray(b.incomeCategories))
      setIncomeCategories(b.incomeCategories.map((c: Category) => ({ ...c, updatedAt: restoredAt })));
    if (Array.isArray(b.sources)) setSources(b.sources);
    if (b.settings) {
      if (typeof b.settings.currency === 'string') setUserCurrency(b.settings.currency);
      setMonthlyBudget(typeof b.settings.monthlyBudget === 'number' ? b.settings.monthlyBudget : undefined);
      // Absent in backups written before this was tracked, which is the same
      // thing as "never dismissed" - so the plain coercion is the right read.
      setBudgetNudgeDismissed(!!b.settings.budgetNudgeDismissed);
      if (typeof b.settings.userName === 'string') setUserName(b.settings.userName);
      if (typeof b.settings.defaultSourceExpense === 'string') setDefaultSourceExpense(b.settings.defaultSourceExpense);
      if (typeof b.settings.defaultSourceIncome === 'string') setDefaultSourceIncome(b.settings.defaultSourceIncome);
    }
    setRefreshKey((prev) => prev + 1);
    setCurrentTab('dashboard');
    track('backup_restored', { count });
    toast.success(t('toast.backupRestored'), {
      description: t(count === 1 ? 'toast.backupRestoredDesc.one' : 'toast.backupRestoredDesc.other', { n: count }),
      duration: 2000,
    });
  };

  // Commit an import after any review decision. Approved proposals become real
  // chips; declined ones import their rows without a subcategory. This is the
  // ONLY place an import can touch the category lists.
  const commitImport = (res: ImportResult, approvedKeys: ReadonlySet<string>) => {
    const applied = applyImportDecision(res, categories, incomeCategories, approvedKeys);
    if (res.proposedSubcategories.length > 0) {
      setCategories(applied.categories);
      saveCategories(applied.categories);
      setIncomeCategories(applied.incomeCategories);
      saveIncomeCategories(applied.incomeCategories);
    }
    setExpenses((prev) => [...applied.transactions, ...prev]);
    setRefreshKey((prev) => prev + 1);
    setCurrentTab('dashboard');
    const realSkips = res.skipped.filter((sk) => sk.reason !== 'zero amount');
    track('data_imported', {
      count: res.added,
      uncategorized: res.uncategorized,
      skipped: res.skipped.length,
      proposed: res.proposedSubcategories.length,
      approved: approvedKeys.size,
    });
    if (res.uncategorized || realSkips.length) {
      // Something needs the user's eyes - a dialog they dismiss, not a toast
      // that dismisses itself. Zero-amount skips alone don't qualify: that
      // guard is bookkeeping, not news.
      setImportSummary(res);
    } else {
      toast.success(t(res.added === 1 ? 'toast.imported.one' : 'toast.imported.other', { n: res.added }), {
        description: t('toast.importedDesc'),
        duration: 2200,
      });
      // The import may have dropped a year of one-offs behind series that
      // already exist - offer to fold them in. When the summary dialog is up
      // instead, the offer waits for its close (see onClose below); two
      // stacked dialogs is one too many.
      window.setTimeout(offerSeriesCleanup, 800);
    }
  };

  // Import a lightweight JSON payload (see lib/importData). Resolves category
  // names against the user's own categories and prepends the transactions. A
  // file that wants NEW subcategories stops at a review sheet first: the
  // import proposes, the user decides, and only then does anything commit.
  // A full backup file (from Export) is restored instead.
  const handleImportData = (payload: ImportPayload) => {
    // Full backup? Restore everything rather than appending.
    const p = payload as any;
    if (isBackupFile(p)) {
      restoreBackup(p);
      return { added: 0, defaulted: 0, skipped: [] };
    }
    const res = buildImport(payload, categories, incomeCategories, userCurrency);
    const realSkips = res.skipped.filter((sk) => sk.reason !== 'zero amount');
    if (res.added === 0) {
      if (realSkips.length) setImportSummary(res);
      else toast.error(t('toast.nothingImported'), { description: t('toast.nothingImportedFile'), duration: 2200 });
      return res;
    }
    if (res.proposedSubcategories.length > 0) {
      setPendingImport(res); // the review sheet takes it from here
      return res;
    }
    commitImport(res, new Set());
    return res;
  };

  // Full reset: wipe everything and return to a fresh first-login. Deletes the
  // cloud record and signs out (so the next sign-in is a clean first login) —
  // handy for re-testing onboarding with a test account.
  // Wipe local storage + in-memory state back to a fresh first-login. Shared by
  // "Erase all data" and account deletion.
  const resetLocalState = () => {
    clearAllData();
    dashboardViewRef.current = null;
    setExpenses([]);
    setRecurringRules([]);
    setCategories(initialCategories);
    setIncomeCategories(initialIncomeCategories);
    setSources(DEFAULT_SOURCES);
    setDefaultSourceExpense(DEFAULT_SOURCE_EXPENSE);
    setDefaultSourceIncome(DEFAULT_SOURCE_INCOME);
    setSelectedSourceId(DEFAULT_SOURCE_EXPENSE);
    setUserName('');
    setUserCurrency('EUR');
    setMonthlyBudget(undefined);
    setBudgetNudgeDismissed(false);
    setCurrentTab('dashboard');
    setHasCompletedOnboarding(false);
    setHasSeenIntro(false);
  };

  const handleEraseAllData = async () => {
    if (userId) {
      // Erasing must clear the cloud copy too, or the next sign-in silently
      // resurrects the "erased" data. Refuse rather than half-erase.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast.error(t('toast.offline'), {
          description: t('toast.offlineEraseDesc'),
          duration: 3200,
        });
        return;
      }
      setCloudHydrated(false); // stop write-through from re-saving during teardown
      try {
        await deleteCloud(userId);
      } catch {
        setCloudHydrated(true);
        toast.error(t('toast.eraseCloudFailed'), {
          description: t('toast.checkConnection'),
          duration: 3200,
        });
        return;
      }
    }
    resetLocalState();
    // Return to the sign-in screen for a clean first-login next time
    leaveGuest();
    if (userId) await signOut();
  };

  // Permanently delete the account (Apple 5.1.1(v)). The Edge Function removes
  // the cloud data + auth user and signs out; we then wipe local state so a
  // future sign-in never rehydrates the deleted account's data. On failure the
  // user stays signed in and the error is surfaced by Settings.
  const handleDeleteAccount = async (): Promise<{ error: string | null }> => {
    setCloudHydrated(false); // stop write-through during teardown
    const res = await deleteAccount();
    if (res.error) {
      setCloudHydrated(true); // still signed in — resume syncing
      return res;
    }
    resetLocalState();
    return { error: null };
  };

  // Source CRUD + defaults (managed in Settings › Sources)
  const handleAddSource = (source: Omit<Source, 'id'>) => {
    const id = `src-${Date.now()}`;
    setSources(prev => [...prev, { ...source, id }]);
  };

  const handleEditSource = (id: string, updates: Omit<Source, 'id'>) => {
    setSources(prev => prev.map(s => (s.id === id ? { ...updates, id } : s)));
  };

  const handleDeleteSource = (id: string) => {
    setSources(prev => {
      const next = prev.filter(s => s.id !== id);
      // If a default (or the currently selected) source was removed, fall back
      const fallback = next[0]?.id;
      if (fallback) {
        if (defaultSourceExpense === id) setDefaultSourceExpense(fallback);
        if (defaultSourceIncome === id) setDefaultSourceIncome(fallback);
        if (selectedSourceId === id) setSelectedSourceId(fallback);
      }
      return next;
    });
  };

  const handleSetDefaultSource = (direction: 'expense' | 'income', sourceId: string) => {
    if (direction === 'income') setDefaultSourceIncome(sourceId);
    else setDefaultSourceExpense(sourceId);
  };

  const handleCurrencyChange = (newCurrency: string) => {
    // Only update the currency preference for NEW transactions
    // Existing transactions keep their original currency
    // The budget is an amount in the main currency, so convert it - otherwise a
    // 3,000 EUR limit would silently become 3,000 JPY.
    if (monthlyBudget && newCurrency !== userCurrency) {
      setMonthlyBudget(Math.round(convertAmount(monthlyBudget, userCurrency, newCurrency)));
    }
    setUserCurrency(newCurrency);
    setRefreshKey(prev => prev + 1); // Force refresh of dashboard
    
    toast.success(t('toast.currencyUpdated', { c: newCurrency }), {
      description: t('toast.currencyUpdatedDesc'),
      duration: 1400,
    });
  };

  const handleUserNameChange = (newName: string) => {
    setUserName(newName);
    toast.success(t('toast.nameUpdated'), {
      duration: 1400,
    });
  };

  // While the session (and, when signed in, the cloud data) is resolving, show
  // a minimal splash so we don't flash the sign-in or onboarding screens.
  // Shown only if a tab's chunk is slow enough to notice - the CSS holds it
  // invisible for the first 250ms, so a normal switch still shows nothing.
  const tabFallback = (
    <div className="tab-loading flex justify-center pt-24" role="status" aria-label="Loading">
      <div
        className="tab-loading-spinner w-6 h-6 rounded-full border-2"
        style={{ borderColor: '#E5E5EA', borderTopColor: '#8E8E93' }}
      />
    </div>
  );

  const splash = (label?: string) => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor: '#F6F5F2' }}>
      <TracklyLogo size={64} />
      {label && <p style={{ color: '#8E8E93', fontSize: 14 }}>{label}</p>}
    </div>
  );

  if (authLoading) return splash();

  // Not signed in and not using the app locally → sign-in screen
  if (!session && !guest) return <Suspense fallback={splash()}><SignIn /></Suspense>;

  // The data on this device belongs to a different account. Nothing has been
  // synced in either direction; the user decides. This must come before any
  // screen that could show the data itself.
  if (session && ownerConflict) {
    return (
      <div className="flex flex-col max-w-[430px] mx-auto px-6" style={{ height: '100dvh', backgroundColor: '#F6F5F2' }}>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <TracklyLogo size={56} className="mb-5" />
          <h1 style={{ color: '#1C1C1E', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>
            {t('guard.title')}
          </h1>
          <p style={{ color: '#6B6B75', fontSize: 15, lineHeight: 1.5, maxWidth: 320 }}>
            {getLanguage() === 'it' ? (
              <>
                Hai effettuato l'accesso come <span style={{ color: '#1C1C1E', fontWeight: 600 }}>{userEmail}</span>,
                ma le spese salvate qui appartengono a{' '}
                <span style={{ color: '#1C1C1E', fontWeight: 600 }}>{ownerConflict.email || 'un altro account'}</span>.
                Per proteggerle, nulla è stato caricato sul tuo account.
              </>
            ) : (
              <>
                You're signed in as <span style={{ color: '#1C1C1E', fontWeight: 600 }}>{userEmail}</span>, but the
                expenses stored here belong to{' '}
                <span style={{ color: '#1C1C1E', fontWeight: 600 }}>{ownerConflict.email || 'a different account'}</span>.
                To protect them, nothing has been uploaded to your account.
              </>
            )}
          </p>
        </div>
        <div className="pt-4 flex-shrink-0" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => {
              // Clear the other account's data from this device, then attach
              // this account cleanly (its own cloud data, or a fresh start).
              resetLocalState();
              rememberSyncBase(null, null);
              setOwnerConflict(null);
              setHydrateTick((t) => t + 1);
            }}
            className="w-full py-4 rounded-2xl font-medium text-base transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#4F74F3', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
          >
            {t('guard.fresh')}
          </button>
          <p className="text-center mt-2 px-4" style={{ color: '#A5A5AD', fontSize: 12, lineHeight: 1.45 }}>
            {getLanguage() === 'it'
              ? <>Rimuove quei dati solo da questo dispositivo. {ownerConflict.email || "L'altro account"} conserva l'ultimo backup fatto sul proprio account.</>
              : <>Removes that data from this device only. {ownerConflict.email || 'The other account'} keeps whatever was last backed up to its own account.</>}
          </p>
          <button onClick={() => void signOut()} className="w-full py-3 mt-1 text-[15px] font-medium" style={{ color: '#8E8E93' }}>
            {t('guard.back')}
          </button>
        </div>
      </div>
    );
  }

  // Signed in but the account's data hasn't loaded yet.
  //
  // Only wait when this device has nothing of its own to show - a fresh phone,
  // where the splash is honest. With local data we render it immediately and
  // let the cloud merge in behind: the app is offline-first, so blocking every
  // launch on a network round trip made the whole UI hostage to the slowest
  // connection (measured at 5.5s on a bad one, for data already on the device).
  if (session && !cloudHydrated && expenses.length === 0) return splash(t('guard.loading'));

  // Show onboarding if not completed. Pre-fill the name with the first name
  // from the signed-in account (Google gives `given_name`), surname excluded.
  if (!hasCompletedOnboarding) {
    const meta = (session?.user?.user_metadata ?? {}) as Record<string, string>;
    const googleFirstName = meta.given_name || (meta.full_name || meta.name || '').trim().split(/\s+/)[0] || '';
    return <Onboarding onComplete={handleOnboardingComplete} initialName={googleFirstName} />;
  }

  // First run after name + currency: show the feature carousel once
  if (!hasSeenIntro) {
    return (
      <Suspense fallback={splash()}>
      <WelcomeCarousel
        userName={userName}
        onDone={() => setHasSeenIntro(true)}
        onSetupCategories={() => {
          setHasSeenIntro(true);
          setCurrentTab('settings');
          setOpenCategoriesOnSettings(true);
        }}
        onLoadDemo={handleLoadDemoData} // loads samples in place; carousel then advances to the last slide
      />
      </Suspense>
    );
  }

  // On anything wider than a phone the app stays a phone-width column - but the
  // page behind it goes a shade darker so the margins read as a frame rather
  // than as space we forgot to fill. Every rule for that is md: only, so the
  // phone rendering is untouched.
  return (
    // Deliberately NOT keyed on language. Keying here remounted the entire
    // content tree on every switch - state reset, effects re-run, charts
    // redrawn, scroll lost - which read as a full page reload. Nothing in the
    // app is wrapped in React.memo, so a plain re-render already reaches every
    // descendant; the only language-dependent useMemo (the Dashboard's insight
    // sentences) now lists language in its deps instead.
    <div className="min-h-screen bg-[#F6F5F2] md:bg-[#ECEAE6]">
      <Toaster position="top-center" />
      {importSummary && (
        <ImportSummaryDialog
          result={importSummary}
          onClose={() => {
            setImportSummary(null);
            window.setTimeout(offerSeriesCleanup, 400);
          }}
          onReview={() => {
            setImportSummary(null);
            // Land on the rows that need eyes, not on today's empty month:
            // the freshest import batch decides the year, and the rows the
            // dialog counted are the ones sitting in the catch-all bucket.
            const stamps = expenses.map((e) => e.importedAt).filter(Boolean) as string[];
            const latest = stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null;
            const batch = latest ? expenses.filter((e) => e.importedAt === latest) : [];
            const yearCount = new Map<string, number>();
            for (const t of batch) {
              const y = t.date.slice(0, 4);
              yearCount.set(y, (yearCount.get(y) ?? 0) + 1);
            }
            const year = [...yearCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            const catchAll = categories.find((c) => CATCHALL_RE.test(c.name.trim()))?.name;
            setActivityPreset({
              typeFilter: 'Imported',
              year,
              // Only narrow to the catch-all when that is what the dialog was
              // flagging - a summary about skipped rows should show the batch.
              categoryFilter: importSummary.uncategorized > 0 ? catchAll : undefined,
            });
            setCurrentTab('activity');
          }}
        />
      )}
      {pendingImport && (
        <ImportReviewDialog
          result={pendingImport}
          onConfirm={(approved) => {
            setPendingImport(null);
            commitImport(pendingImport, approved);
          }}
          onCancel={() => {
            setPendingImport(null);
            track('import_review_cancelled', { proposed: pendingImport.proposedSubcategories.length });
            toast('Import cancelled', { description: t('toast.nothingAdded'), duration: 2000 });
          }}
        />
      )}

      {/* iPhone 14 Container — Activity needs an exact viewport height so only
          its transaction list scrolls; other tabs scroll as a whole page */}
      <div
        className={`max-w-[430px] mx-auto flex flex-col md:shadow-[0_0_40px_rgba(0,0,0,0.07)] ${currentTab === 'activity' ? 'overflow-hidden' : 'min-h-screen'}`}
        style={{ backgroundColor: '#F6F5F2', ...(currentTab === 'activity' ? { height: '100dvh' } : {}) }}
      >
        {/* Status Bar Space — clears the iOS status bar when installed, minimal in a browser tab */}
        <div className="app-top-inset flex-shrink-0" style={{ backgroundColor: '#F6F5F2' }} />

        {/* Content - Different structure for activity tab vs others */}
        {currentTab === 'activity' ? (
          <Activity
            preset={activityPreset ?? undefined}
            onPresetConsumed={() => setActivityPreset(null)}
            viewStateRef={activityViewRef}
            transactions={expenses}
            onEditTransaction={handleEditExpense}
            onDeleteTransaction={handleDeleteExpense}
            onModalOpenChange={setIsModalOpen}
            categories={categories}
            incomeCategories={incomeCategories}
            currency={userCurrency}
            sources={sources}
          />
        ) : (
          // Other tabs - Parent scrollable
          <div ref={mainScrollRef} className="flex-1 overflow-y-auto pb-32">
            <Suspense fallback={tabFallback}>
            {currentTab === 'dashboard' && (
              <Dashboard
                key={refreshKey}
                expenses={expenses}
                categories={categories}
                incomeCategories={incomeCategories}
                sources={sources}
                userName={userName}
                currency={userCurrency}
                onEditExpense={handleEditExpense}
                onDeleteExpense={handleDeleteExpense}
                view="overview"
                initialPeriod={dashboardInitialPeriod}
                viewStateRef={dashboardViewRef}
                monthlyBudget={monthlyBudget}
                budgetNudgeDismissed={budgetNudgeDismissed}
                onSetMonthlyBudget={setMonthlyBudget}
                onDismissBudgetNudge={() => setBudgetNudgeDismissed(true)}
                onAddFirstExpense={() => setCurrentTab('add')}
                onLoadDemoData={handleLoadDemoData}
              />
            )}
            {currentTab === 'trend' && (
              <Dashboard
                key={`trend-${refreshKey}`}
                expenses={expenses}
                categories={categories}
                incomeCategories={incomeCategories}
                sources={sources}
                userName={userName}
                currency={userCurrency}
                onEditExpense={handleEditExpense}
                onDeleteExpense={handleDeleteExpense}
                monthlyBudget={monthlyBudget}
                view="trend"
                weekStartsOn={weekStartsOn}
                trendStateRef={trendViewRef}
                onShowOverview={(period) => {
                  setDashboardInitialPeriod(period);
                  setCurrentTab('dashboard');
                }}
              />
            )}
            {currentTab === 'settings' && (
              <Settings
                categories={categories}
                incomeCategories={incomeCategories}
                weekStartsOn={weekStartsOn}
                onSetWeekStartsOn={setWeekStartsOn}
                language={language}
                onSetLanguage={adoptLanguage}
                onAddCategory={handleAddCategory}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
                onAddSubcategory={handleAddSubcategory}
                onEditSubcategory={handleEditSubcategory}
                onDeleteSubcategory={handleDeleteSubcategoryHandler}
                onAddIncomeCategory={handleAddIncomeCategory}
                onEditIncomeCategory={handleEditIncomeCategory}
                onDeleteIncomeCategory={handleDeleteIncomeCategory}
                onModalOpenChange={setIsModalOpen}
                userCurrency={userCurrency}
                onCurrencyChange={handleCurrencyChange}
                monthlyBudget={monthlyBudget}
                onMonthlyBudgetChange={setMonthlyBudget}
                userName={userName}
                onUserNameChange={handleUserNameChange}
                onLoadDemoData={handleLoadDemoData}
                onEraseAllData={handleEraseAllData}
                onEraseDemoData={handleEraseDemoData}
                hasDemoData={hasDemoData}
                onImportData={handleImportData}
                onExportData={handleExportData}
                onExportCsv={handleExportCsv}
                sources={sources}
                defaultSourceExpense={defaultSourceExpense}
                defaultSourceIncome={defaultSourceIncome}
                onSetDefaultSource={handleSetDefaultSource}
                onAddSource={handleAddSource}
                onEditSource={handleEditSource}
                onDeleteSource={handleDeleteSource}
                openSourcesOnMount={openSourcesOnSettings}
                onSourcesOpened={() => setOpenSourcesOnSettings(false)}
                openCategoriesOnMount={openCategoriesOnSettings}
                onCategoriesOpened={() => setOpenCategoriesOnSettings(false)}
                userEmail={userEmail}
                userAvatar={userAvatar}
                syncStatus={syncStatus}
                lastSyncedAt={lastSyncedAt}
                isGuest={guest}
                onSignOut={async () => { await signOut(); }}
                onDeleteAccount={handleDeleteAccount}
                onSignInToSync={leaveGuest}
              />
            )}
            </Suspense>
          </div>
        )}
        
        {/* Bottom Navigation Bar - Only show when NOT in Add mode AND no modals
            are open.

            A floating dock rather than a full-bleed slab: inset from all three
            edges, fully rounded, dark glass over whatever is scrolling beneath.
            The slab version ran edge to edge with a hard top border, which cut
            list rows mid-line and made the heaviest element on every screen a
            rectangle in an app that is otherwise all soft corners.

            The outer element is a positioning frame only - no background, and
            crucially POINTER-EVENTS-NONE, so the cream gutter either side of
            the dock scrolls the content underneath instead of swallowing taps.
            Each control turns pointer events back on.

            Wide screens keep the same shape, just centred on the column. */}
        {/* Portalled to <body>, and not for stacking this time: rendered in
            place, the glass didn't blur. Chromium composites a fixed
            backdrop-filter element deep inside the app tree without sampling
            the inner scroller's content - no ancestor creates a backdrop
            root, the spec says it should work, and an identical element
            appended directly to <body> blurs perfectly. Rather than bet on
            which engines share the quirk, hoist to where it provably works
            everywhere. */}
        {currentTab !== 'add' && !isModalOpen && createPortal(
          <>
            {/* The strip below the dock reads as "content continues", never
                as content - the Revolut treatment. Blur, not opacity: a plain
                cream wash was tried first and it left ghost text, half
                readable and looking like a rendering mistake; blurred glyphs
                read as texture, which tells the user not to aim reading down
                here.

                The stacking is load-bearing: Chromium honours only the
                TOPMOST backdrop-filter element in a stacking context and
                silently drops the filter on any below it - rendered under
                the dock (z-40) this strip tinted but never blurred. It sits
                at z-50 instead: since strip and dock do not overlap
                geometrically, the order is visually irrelevant, but it hands
                the one working filter slot to the element that needs it. The
                dock's own backdrop blur stays declared for engines that
                compose more than one, and its tint is dark enough to carry
                the look alone where they don't. The strip also must not
                overlap the dock (that re-triggers the same drop), so it
                fills exactly the gap under it. No feathering mask either:
                mask-image over backdrop-filter attenuates the blur in
                Chromium. */}
            <div
              aria-hidden="true"
              className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none"
              style={{
                height: 'max(20px, env(safe-area-inset-bottom))',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                backgroundColor: 'rgba(246, 245, 242, 0.42)',
              }}
            />
            <div
              className="fixed left-0 right-0 z-40 pointer-events-none px-3.5"
              style={{
                // Clear of the iOS home indicator, which occupies ~5pt about
                // 13pt above the physical edge. This app runs WITHOUT
                // viewport-fit=cover, so env() is 0 on iPhones and the max()
                // floor is what actually positions the dock there: 14px left
                // the indicator a single pixel of air, 20px gives it seven.
                bottom: 'max(20px, env(safe-area-inset-bottom))',
              }}
              onClick={(e) => e.stopPropagation()}
            >
            <div
              className="relative w-full max-w-[430px] mx-auto grid grid-cols-5 items-center px-3 py-2 pointer-events-auto rounded-[26px] backdrop-blur-[26px] backdrop-saturate-150"
              style={{
                // 0.84: dark enough that the dock reads correctly even where
                // its backdrop blur is dropped (Chromium skips the lower of
                // two overlapping backdrop filters, and engines vary), light
                // enough that on engines that do compose it, content beneath
                // still ghosts as soft luminance. 0.66 was tried and washes
                // the slab grey; 0.78 relied on a blur that not every
                // compositor delivers, leaving readable text through the
                // glass. A dark bar over a light app only ever ghosts
                // luminance, not shapes - Instagram's full see-through comes
                // from light glass over light content.
                backgroundColor: 'rgba(28, 28, 30, 0.84)',
                // Drop shadow lifts it off the page; the inset hairline is the
                // top-edge highlight that makes glass read as glass.
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
              }}
            >
              <DockTab
                icon={BarChart3}
                label={t('tab.dashboard')}
                active={currentTab === 'dashboard'}
                onClick={() => {
                  setDashboardInitialPeriod(null); // direct visits start on the current month
                  dashboardViewRef.current = null; // ...and from the top-level view
                  setCurrentTab('dashboard');
                }}
              />
              <DockTab
                icon={List}
                label={t('tab.activity')}
                active={currentTab === 'activity'}
                onClick={() => setCurrentTab('activity')}
              />
              <button
                onClick={() => setCurrentTab('add')}
                aria-label={t('add.aria')}
                className="flex flex-col items-center pointer-events-auto justify-self-center"
              >
                <div
                  className="w-[46px] h-[46px] rounded-[16px] flex items-center justify-center transition-transform active:scale-95"
                  style={{
                    // The logo's own gradient, stop for stop, on the most-tapped
                    // control in the app: the one place the brand is allowed to
                    // shout. Deliberately NOT the flat accent - this mirrors the
                    // mark, and #4F74F3 is that gradient's midpoint, so every
                    // flat accent in the app reads as the same family.
                    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
                    // Tightened from an 18px/0.55 halo. Inside the dock that
                    // glow spilled past the rounded edge and washed over the
                    // list scrolling behind it, which read as a render bug.
                    boxShadow: '0 4px 12px rgba(79, 116, 243, 0.42)',
                  }}
                >
                  <Plus size={24} style={{ color: '#FFFFFF' }} strokeWidth={2.5} />
                </div>
              </button>
              <DockTab
                icon={TrendingUp}
                label={t('tab.trend')}
                active={currentTab === 'trend'}
                onClick={() => setCurrentTab('trend')}
              />
              <DockTab
                icon={SettingsIcon}
                label={t('tab.settings')}
                active={currentTab === 'settings'}
                onClick={() => setCurrentTab('settings')}
              />
            </div>
            </div>
          </>,
          document.body,
        )}

        {/* Full Screen Add Expense Modal */}
        {currentTab === 'add' && (
          <div className="fixed inset-0 bg-white z-60 flex flex-col max-w-[430px] mx-auto overflow-hidden">
            {/* Clear the iOS status bar when installed */}
            <div className="app-top-inset flex-shrink-0" style={{ backgroundColor: '#FFFFFF' }} />
            {/* Header with close button */}
            <div className="h-12 flex items-center justify-end px-6 flex-shrink-0">
              <button 
                onClick={handleCloseModal}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
              >
                <X size={20} className="text-neutral-600" />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pb-28">
              {/* Transaction Type Switch — the same sliding-thumb segmented
                  control the Dashboard settled on, sized to its content. */}
              <div className="px-6 pb-5">
                <div className="relative inline-flex p-1 rounded-full" style={{ backgroundColor: '#ECEAE4' }}>
                  <div
                    className="absolute rounded-full"
                    style={{
                      top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)',
                      backgroundColor: '#FFFFFF',
                      boxShadow: switchGlow(transactionType === 'income' ? 'income' : 'expense'),
                      transform: transactionType === 'income' ? 'translateX(100%)' : 'translateX(0)',
                      transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
                    }}
                    aria-hidden="true"
                  />
                  <button
                    onClick={() => handleTransactionTypeChange('expense')}
                    className="relative px-5 py-1.5 text-sm font-medium transition-colors"
                    style={{ color: transactionType === 'expense' ? '#C2352B' : '#8E8E93', minWidth: 96 }}
                  >
                    {t('add.expense')}
                  </button>
                  <button
                    onClick={() => handleTransactionTypeChange('income')}
                    className="relative px-5 py-1.5 text-sm font-medium transition-colors"
                    style={{ color: transactionType === 'income' ? '#1F7A43' : '#8E8E93', minWidth: 96 }}
                  >
                    {t('add.income')}
                  </button>
                </div>
              </div>

              <AmountInput
                value={amount}
                onChange={setAmount}
                currency={selectedTransactionCurrency}
                onCurrencyChange={setSelectedTransactionCurrency}
                autoFocus={!editingExpenseId}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowSourceSelector(true)}
                    className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1 active:scale-95 transition-transform"
                    style={{ backgroundColor: '#F2F1ED', WebkitTapHighlightColor: 'transparent' }}
                    aria-label={t('add.selectSource')}
                  >
                    <SourceLogo source={sources.find(s => s.id === selectedSourceId)} size={24} />
                    <ChevronDown className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} strokeWidth={2.5} />
                  </button>
                }
              />
              
              <DescriptionInput 
                value={description} 
                onChange={setDescription}
                transactionType={transactionType}
                suggestions={descriptionSuggestions}
                onPickSuggestion={handlePickSuggestion}
              />
              
              <DateInput 
                value={date} 
                onChange={setDate} 
                showDatePicker={showDatePicker} 
                setShowDatePicker={setShowDatePicker} 
                recurrence={recurrence}
                onRecurrenceChange={setRecurrence}
              />

              {/* Provenance hint for auto-created occurrences. Deliberately not
                  in the Activity list - the repeat icon covers it there. */}
              {editingAutoOccurrence && (
                <div className="px-6 -mt-2 pb-4 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8E8E93' }} strokeWidth={2} />
                  <span style={{ color: '#8E8E93', fontSize: 12.5, lineHeight: 1.4 }}>
                    {t('add.occurrenceNote')}
                  </span>
                </div>
              )}
              
              <CategorySelector
                selectedCategory={selectedCategory}
                onSelectCategory={handleCategorySelect}
                categories={activeCategories}
                subcategories={subcategories}
                selectedSubcategory={selectedSubcategory}
                onSelectSubcategory={setSelectedSubcategory}
              />
            </div>

            {/* Fixed Save Button at Bottom */}
            <SaveButton
              onClick={handleSave}
              disabled={!canSave}
              isEditing={!!editingExpenseId}
              transactionType={transactionType}
            />

            {/* Source picker opened from the pill on the amount line */}
            <SourceSelectorModal
              isOpen={showSourceSelector}
              sources={sources}
              selectedSourceId={selectedSourceId}
              onSelect={(id) => setSelectedSourceId(id)}
              onClose={() => setShowSourceSelector(false)}
              onManage={() => {
                handleCloseModal();
                setCurrentTab('settings');
                setOpenSourcesOnSettings(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Recurring scope dialogs - rendered last so they stack above the add
          screen's composited (translateZ) layers. */}
      {pendingRecurringEdit && (
        <div className="relative z-[60]">
          <RecurringScopeDialog
            title={t('dlg.saveChanges')}
            message={t('dlg.repeatEditMsg')}
            onlyThisLabel={t('dlg.onlyThis')}
            futureLabel={t('dlg.future')}
            onOnlyThis={() => confirmRecurringEdit('one')}
            onFuture={() => confirmRecurringEdit('future')}
            onCancel={() => setPendingRecurringEdit(null)}
          />
        </div>
      )}
      {pendingRecurringDelete && (
        <div className="relative z-[60]">
          <RecurringScopeDialog
            variant="danger"
            title={t('dlg.deleteRecurring')}
            message={t('dlg.repeatDeleteMsg')}
            onlyThisLabel={t('dlg.onlyThis')}
            futureLabel={t('dlg.future')}
            onOnlyThis={() => confirmRecurringDelete('one')}
            onFuture={() => confirmRecurringDelete('future')}
            onCancel={() => setPendingRecurringDelete(null)}
          />
        </div>
      )}
      {/* Occurrences the engine generated on top of rows that already existed,
          before it learned to look. Only the generated copies are removed -
          the user's own row, with the amount they actually paid, stays. */}
      {pendingDuplicates && !pendingBackTag && (() => {
        const names = [...new Set(pendingDuplicates.map((d) => d.generated.description))];
        const summary = names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '');
        const n = pendingDuplicates.length;
        return (
          <div className="relative z-[60]">
            <ConfirmDialog
              variant="danger"
              title={`Remove ${n} duplicate${n === 1 ? '' : 's'}?`}
              message={`Your recurring schedules created ${n} transaction${n === 1 ? '' : 's'} on days that already had one (${summary}). Only the generated cop${n === 1 ? 'y is' : 'ies are'} removed - your own transactions stay.`}
              confirmLabel={`Remove ${n === 1 ? 'it' : `all ${n}`}`}
              onConfirm={() => {
                const ids = new Set(pendingDuplicates.map((d) => d.generated.id));
                setExpenses((prev) => prev.filter((e) => !ids.has(e.id)));
                setRefreshKey((prev) => prev + 1);
                toast.success(t(n === 1 ? 'toast.dupes.one' : 'toast.dupes.other', { n }), { duration: 1600 });
                setPendingDuplicates(null);
                // The tidy-up offer, if any, waits for the next open.
              }}
              onCancel={() => {
                saveBackTagDismissed([
                  ...new Set([...loadBackTagDismissed(), ...pendingDuplicates.map((d) => d.generated.id)]),
                ]);
                setPendingDuplicates(null);
              }}
            />
          </div>
        );
      })()}
      {/* The scan the other way round: series that already exist, history
          that arrived untagged (an import, typically). Tagging attaches the
          rows to the EXISTING rules as pre-anchor history - no new rules, no
          new future occurrences, the schedules the user set up stay exactly
          as they are. Declining is remembered per transaction. */}
      {pendingSeriesCleanup && !pendingBackTag && (
        <div className="relative z-[60]">
          <SeriesClaimDialog
            claims={pendingSeriesCleanup}
            currency={userCurrency}
            onConfirm={(approved) => {
              const total = approved.reduce((s, c) => s + c.rows.length, 0);
              setExpenses((prev) => {
                let next = prev;
                for (const c of approved) next = tagPastSeries(next, c.rows.map((r) => r.id), c.rule);
                return next;
              });
              // Unchecking is an answer too: those rows are not offered again.
              const approvedIds = new Set(approved.flatMap((c) => c.rows.map((r) => r.id)));
              const declined = pendingSeriesCleanup
                .flatMap((c) => c.rows.map((r) => r.id))
                .filter((id) => !approvedIds.has(id));
              if (declined.length) saveBackTagDismissed([...new Set([...loadBackTagDismissed(), ...declined])]);
              setRefreshKey((prev) => prev + 1);
              toast.success(t(total === 1 ? 'toast.markedRec.one' : 'toast.markedRec.other', { n: total }), { duration: 1600 });
              setPendingSeriesCleanup(null);
            }}
            onCancel={() => {
              // Remember every id offered, so the same rows never nag again;
              // a future import bringing NEW matches still will.
              saveBackTagDismissed([
                ...new Set([...loadBackTagDismissed(), ...pendingSeriesCleanup.flatMap((c) => c.rows.map((r) => r.id))]),
              ]);
              setPendingSeriesCleanup(null);
            }}
          />
        </div>
      )}
      {/* Offered once, right after a series is declared recurring: fold its
          earlier one-off copies (imported history, mostly) into the chain.
          Declining leaves them untouched - it never asks again for this rule. */}
      {pendingBackTag && (
        <div className="relative z-[60]">
          <ConfirmDialog
            variant="neutral"
            icon={Repeat}
            title={getLanguage() === 'it' ? 'Includere anche le precedenti?' : 'Include earlier ones?'}
            message={getLanguage() === 'it'
              ? (pendingBackTag.ids.length === 1
                  ? `1 transazione passata chiamata "${pendingBackTag.name}" non è segnata come ricorrente. Segnarla come parte di questa serie?`
                  : `${pendingBackTag.ids.length} transazioni passate chiamate "${pendingBackTag.name}" non sono segnate come ricorrenti. Segnarle come parte di questa serie?`)
              : `${pendingBackTag.ids.length} past transaction${pendingBackTag.ids.length === 1 ? '' : 's'} named "${pendingBackTag.name}" ${pendingBackTag.ids.length === 1 ? 'is' : 'are'} not marked as recurring. Mark ${pendingBackTag.ids.length === 1 ? 'it' : 'them'} as part of this series too?`}
            confirmLabel={getLanguage() === 'it'
              ? (pendingBackTag.ids.length === 1 ? 'Segnala come ricorrente' : `Segna tutte e ${pendingBackTag.ids.length}`)
              : `Mark ${pendingBackTag.ids.length === 1 ? 'it' : 'all ' + pendingBackTag.ids.length} recurring`}
            onConfirm={() => {
              setExpenses((prev) => tagPastSeries(prev, pendingBackTag.ids, pendingBackTag.rule));
              setRefreshKey((prev) => prev + 1);
              toast.success(t(pendingBackTag.ids.length === 1 ? 'toast.markedRec.one' : 'toast.markedRec.other', { n: pendingBackTag.ids.length }), { duration: 1600 });
              setPendingBackTag(null);
            }}
            onCancel={() => setPendingBackTag(null)}
          />
        </div>
      )}
    </div>
  );
}