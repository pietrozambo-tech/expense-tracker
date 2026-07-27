import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { BarChart3, Plus, List, X, Settings as SettingsIcon, TrendingUp, ChevronDown, Repeat } from 'lucide-react';
import { CURRENCIES, convertAmount, BASE_CURRENCY } from './utils/currency';
import type { Transaction, Source, RecurringRule } from './types';
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
} from './lib/storage';
import { DEFAULT_SOURCES, DEFAULT_SOURCE_EXPENSE, DEFAULT_SOURCE_INCOME } from './components/sources';
import { SourceLogo } from './components/SourceLogo';
import { SourceSelectorModal } from './components/SourceSelectorModal';
import { getDemoTransactions } from './lib/demoData';
import { buildImport, type ImportPayload } from './lib/importData';
import { buildBackup, downloadBackup, isBackupFile } from './lib/backup';
import { Activity } from './components/Activity';
import { AmountInput } from './components/AmountInput';
import { DateInput } from './components/DateInput';
import { CategorySelector } from './components/CategorySelector';
import { SaveButton } from './components/SaveButton';
import { DescriptionInput } from './components/DescriptionInput';
import { Onboarding } from './components/Onboarding';
import { useAuth } from './auth/AuthProvider';
import { processRecurrence, buildRuleTemplate, newRuleId, occurrenceDueDate, isActiveRule } from './lib/recurrence';
import { RecurringScopeDialog } from './components/RecurringScopeDialog';

// The heavyweight screens load on demand so the initial bundle stays small.
// (Named exports wrapped for React.lazy's default-export contract.)
import type { DashboardViewState } from './components/Dashboard';

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
const WelcomeCarousel = lazyWithRetry(() => import('./components/WelcomeCarousel').then((m) => ({ default: m.WelcomeCarousel })), 'carousel');
const SignIn = lazyWithRetry(() => import('./auth/SignIn').then((m) => ({ default: m.SignIn })), 'signin');
import { TracklyLogo } from './components/TracklyLogo';
import { loadCloud, saveCloud, deleteCloud, type SyncPayload } from './lib/cloud';
import { track } from './lib/analytics';
import { categories as initialCategories, incomeCategories as initialIncomeCategories } from './components/categories';
import { reassignToOthers } from './lib/categoryOps';

export default function App() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => loadSettings().onboarded);
  const [hasSeenIntro, setHasSeenIntro] = useState(() => loadSettings().hasSeenIntro ?? false);
  const [userName, setUserName] = useState(() => loadSettings().userName);
  const [userCurrency, setUserCurrency] = useState(() => loadSettings().currency);
  const [selectedTransactionCurrency, setSelectedTransactionCurrency] = useState('EUR'); // Currency for current transaction being added/edited
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'activity' | 'add' | 'trend' | 'settings'>('dashboard');
  // The shared scroll container for the non-activity tabs. Switching tabs must
  // start the new tab from the top (see the effect below).
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
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
  const [pendingRecurringDelete, setPendingRecurringDelete] = useState<Transaction | null>(null);
  const [returnToTab, setReturnToTab] = useState<'dashboard' | 'activity' | 'trend' | 'settings' | 'add'>('dashboard'); // Track which tab to return to after editing
  // Set when a Trend month is tapped so the Overview opens on that period
  const [dashboardInitialPeriod, setDashboardInitialPeriod] = useState<{ month: number; year: number; type: 'expense' | 'income' } | null>(null);
  // The Overview's last view (period + drilldown), restored after an edit
  // round-trip; cleared by a deliberate tap on the Dashboard nav button.
  const dashboardViewRef = useRef<DashboardViewState | null>(null);
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
  useEffect(() => {
    saveSettings({
      onboarded: hasCompletedOnboarding,
      userName,
      currency: userCurrency,
      hasSeenIntro,
      defaultSourceExpense,
      defaultSourceIncome,
    });
  }, [hasCompletedOnboarding, userName, userCurrency, hasSeenIntro, defaultSourceExpense, defaultSourceIncome]);

  // When opening a NEW transaction, pre-select the current default source for
  // the active type — so changing the default in Settings takes effect
  // immediately (without needing to toggle expense/income).
  useEffect(() => {
    if (currentTab === 'add' && !editingExpenseId) {
      setSelectedSourceId(transactionType === 'income' ? defaultSourceIncome : defaultSourceExpense);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab]);

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
      hasSeenIntro,
      defaultSourceExpense,
      defaultSourceIncome,
    },
  });

  // On sign-in: load the user's cloud data into state; if the account has none
  // yet, push the current (local) data up — a one-time migration on first login.
  useEffect(() => {
    if (!userId) {
      setCloudHydrated(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cloud = await loadCloud(userId);
        if (cancelled) return;
        if (cloud) {
          setExpenses(cloud.transactions ?? []);
          setRecurringRules(cloud.recurringRules ?? []);
          setCategories(cloud.categories ?? initialCategories);
          setIncomeCategories(cloud.incomeCategories ?? initialIncomeCategories);
          setSources(cloud.sources?.length ? cloud.sources : DEFAULT_SOURCES);
          const s = cloud.settings ?? ({} as SyncPayload['settings']);
          setHasCompletedOnboarding(!!s.onboarded);
          setUserName(s.userName ?? '');
          setUserCurrency(s.currency ?? 'EUR');
          setHasSeenIntro(!!s.hasSeenIntro);
          setDefaultSourceExpense(s.defaultSourceExpense ?? DEFAULT_SOURCE_EXPENSE);
          setDefaultSourceIncome(s.defaultSourceIncome ?? DEFAULT_SOURCE_INCOME);
        } else {
          await saveCloud(userId, buildPayload());
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
  }, [userId]);

  // Write changes back to the cloud (debounced), once hydrated
  useEffect(() => {
    if (!userId || !cloudHydrated) return;
    setSyncStatus('pending');
    const payload = buildPayload();
    const t = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSyncStatus('offline');
        return; // the 'online' listener below retries automatically
      }
      saveCloud(userId, payload)
        .then(() => {
          setSyncStatus('synced');
          setLastSyncedAt(Date.now());
        })
        .catch(() => setSyncStatus('error'));
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cloudHydrated, syncRetryTick, expenses, recurringRules, categories, incomeCategories, sources, hasCompletedOnboarding, userName, userCurrency, hasSeenIntro, defaultSourceExpense, defaultSourceIncome]);

  // Coming back online (or refocusing after a failed save) retries the sync.
  useEffect(() => {
    const retry = () => setSyncRetryTick((t) => t + 1);
    const onVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

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
      toast.success(`${res.createdCount} recurring transaction${res.createdCount === 1 ? '' : 's'} added`, {
        duration: 2000,
      });
    }
  }, []);
  const recurrenceReady = userId ? cloudHydrated : guest;
  useEffect(() => {
    if (!recurrenceReady) return;
    runRecurrence();
    const onVisible = () => {
      if (document.visibilityState === 'visible') runRecurrence();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [recurrenceReady, runRecurrence]);

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
      toast.error('Please enter an amount');
      return;
    }

    if (!selectedCategory) {
      toast.error('Please select a category');
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
        sourceId: selectedSourceId || undefined
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
        }
      }

      // Force refresh
      setRefreshKey(prev => prev + 1);
      
      toast.success(`${transactionType === 'expense' ? 'Expense' : 'Income'} updated`, {
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
        sourceId: selectedSourceId || undefined
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
      }

      // Add to expenses list
      setExpenses([newExpense, ...expenses]);
      track('transaction_added', { type: transactionType, hasSource: !!selectedSourceId });
      
      // Force refresh of Dashboard and Activity
      setRefreshKey(prev => prev + 1);

      // Success feedback with navigation option
      const categoryName = categoryData?.name;
      const currencyData = CURRENCIES[selectedTransactionCurrency] || CURRENCIES.EUR;
      const currencySymbol = currencyData.symbol;
      
      const formattedToastAmount = currencyData.position === 'before' 
        ? `${currencySymbol}${amount}` 
        : `${amount}${currencySymbol}`;
        
      toast.success(`${formattedToastAmount} saved for ${categoryName}`, {
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
      id: `category-${Date.now()}`
    };
    setCategories([...categories, newCategory]);
    setRefreshKey(prev => prev + 1);
    toast.success('Category added', {
      duration: 1400,
    });
  };

  const handleEditCategory = (id: string, updatedCategory: Omit<typeof categories[0], 'id'>) => {
    setCategories(categories.map(cat => 
      cat.id === id ? { ...updatedCategory, id } : cat
    ));
    
    // Update existing expenses that use this category
    setExpenses(expenses.map(expense => 
      expense.category.id === id 
        ? { ...expense, category: { ...updatedCategory, id } }
        : expense
    ));
    
    setRefreshKey(prev => prev + 1);
    toast.success('Category updated', {
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
    toast.success('Category deleted', {
      duration: 1400,
    });
  };

  const handleAddSubcategory = (categoryId: string, subcategoryName: string) => {
    setCategories(categories.map(cat => 
      cat.id === categoryId 
        ? { ...cat, subcategories: [...(cat.subcategories || []), subcategoryName] }
        : cat
    ));
    setRefreshKey(prev => prev + 1);
    toast.success('Subcategory added', {
      duration: 1400,
    });
  };

  const handleEditSubcategory = (categoryId: string, oldName: string, newName: string) => {
    setCategories(categories.map(cat => 
      cat.id === categoryId 
        ? { 
            ...cat, 
            subcategories: cat.subcategories?.map(sub => sub === oldName ? newName : sub) 
          }
        : cat
    ));
    
    // Update expenses with this subcategory
    setExpenses(expenses.map(expense => 
      expense.category.id === categoryId && expense.subcategory === oldName
        ? { ...expense, subcategory: newName }
        : expense
    ));
    
    setRefreshKey(prev => prev + 1);
    toast.success('Subcategory updated', {
      duration: 1400,
    });
  };

  const handleDeleteSubcategoryHandler = (categoryId: string, subcategoryName: string) => {
    setCategories(categories.map(cat => 
      cat.id === categoryId 
        ? { 
            ...cat, 
            subcategories: cat.subcategories?.filter(sub => sub !== subcategoryName) 
          }
        : cat
    ));
    
    // Remove subcategory from expenses
    setExpenses(expenses.map(expense => 
      expense.category.id === categoryId && expense.subcategory === subcategoryName
        ? { ...expense, subcategory: undefined }
        : expense
    ));
    
    setRefreshKey(prev => prev + 1);
    toast.success('Subcategory deleted', {
      duration: 1400,
    });
  };

  // Income Category CRUD handlers
  const handleAddIncomeCategory = (category: Omit<typeof incomeCategories[0], 'id'>) => {
    const newCategory = {
      ...category,
      id: `income-category-${Date.now()}`
    };
    setIncomeCategories([...incomeCategories, newCategory]);
    setRefreshKey(prev => prev + 1);
    toast.success('Income category added', {
      duration: 1400,
    });
  };

  const handleEditIncomeCategory = (id: string, updatedCategory: Omit<typeof incomeCategories[0], 'id'>) => {
    setIncomeCategories(incomeCategories.map(cat => 
      cat.id === id ? { ...updatedCategory, id } : cat
    ));
    
    // Update existing income transactions that use this category
    setExpenses(expenses.map(expense => 
      expense.type === 'income' && expense.category.id === id 
        ? { ...expense, category: { ...updatedCategory, id } }
        : expense
    ));
    
    setRefreshKey(prev => prev + 1);
    toast.success('Income category updated', {
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
    toast.success('Income category deleted', {
      duration: 1400,
    });
  };

  const handleDeleteExpense = (id: string) => {
    const t = expenses.find((e) => e.id === id);
    const chainRule = t?.recurrenceOf
      ? recurringRules.find((r) => r.id === t.recurrenceOf && isActiveRule(r))
      : undefined;
    if (t && chainRule) {
      // Recurring: ask whether to delete just this occurrence or stop the chain.
      setPendingRecurringDelete(t);
      return;
    }
    setExpenses(expenses.filter(expense => expense.id !== id));
    setRefreshKey(prev => prev + 1);
    toast.success('Expense deleted', {
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

  // "This and future ones": end the old chain at this occurrence, start a new
  // rule from the edited values, and restamp any already-materialized later
  // occurrences (they keep their own dates). Past occurrences are untouched.
  const applyRecurringFuture = (current: Transaction, rule: RecurringRule, values: Partial<Transaction>) => {
    const cutoff = occurrenceDueDate(current, rule);
    const stopping = values.recurrence === 'Never repeat';
    const nextRule: RecurringRule | null = stopping
      ? null
      : { id: newRuleId(), rule: values.recurrence!, anchorDate: values.date!, template: templateFromValues(values) };
    setRecurringRules((prev) => [
      ...prev.map((r) => (r.id === rule.id ? { ...r, endedAt: cutoff } : r)),
      ...(nextRule ? [nextRule] : []),
    ]);
    const isLaterInChain = (e: Transaction) =>
      e.id !== current.id && e.recurrenceOf === rule.id && occurrenceDueDate(e, rule) > cutoff;
    setExpenses((prev) => {
      if (stopping) {
        // Stopping the schedule from here on also removes the auto-created
        // later occurrences - the user just said they shouldn't exist.
        return prev
          .filter((e) => !isLaterInChain(e))
          .map((e) => (e.id === current.id ? { ...e, ...values, recurrenceOf: undefined } : e));
      }
      return prev.map((e) => {
        if (e.id === current.id) return { ...e, ...values, recurrenceOf: nextRule!.id };
        if (isLaterInChain(e))
          return {
            ...e,
            ...templateFromValues(values),
            recurrence: values.recurrence,
            recurrenceOf: nextRule!.id,
            baseAmount: convertAmount(values.amount!, values.currency!, BASE_CURRENCY),
          };
        return e;
      });
    });
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
    toast.success('Transaction updated', { duration: 1400 });
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

  const handleOnboardingComplete = (name: string, currency: string) => {
    setUserName(name);
    setUserCurrency(currency);
    setHasCompletedOnboarding(true);
    track('onboarding_completed', { currency });
  };

  // Demo data (for testing) — date-shifted samples, each with a random source
  // so the field is populated. Added ON TOP of the user's own data (never
  // replacing it): demo rows carry a `demo-` id prefix, so "Erase demo data"
  // removes only them and the real data is untouched. Re-loading first drops any
  // existing demo rows so it stays idempotent.
  const handleLoadDemoData = () => {
    const demo = getDemoTransactions(userCurrency).map((t) => ({
      ...t,
      sourceId: sources.length
        ? sources[Math.floor(Math.random() * sources.length)].id
        : undefined,
    }));
    setExpenses((prev) => [...demo, ...prev.filter((e) => !e.id.startsWith('demo-'))]);
    setRefreshKey(prev => prev + 1);
    setCurrentTab('dashboard');
    track('demo_loaded');
    toast.success('Demo data loaded', {
      description: 'Added on top of your data — remove it anytime',
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
    toast.success('Demo data removed', { duration: 1400 });
  };

  // Export everything as a single backup file: settings, categories,
  // subcategories, sources and all transactions. Re-importable via restore.
  const handleExportData = () => {
    try {
      downloadBackup(
        buildBackup({
          userName,
          currency: userCurrency,
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
      toast.success('Backup exported', {
        description: `${expenses.length} transaction${expenses.length === 1 ? '' : 's'} saved to a file`,
        duration: 2000,
      });
    } catch {
      toast.error('Export failed');
    }
  };

  // Restore a full backup produced by Export — replaces all current data.
  const restoreBackup = (b: any) => {
    const count = Array.isArray(b.transactions) ? b.transactions.length : 0;
    if (Array.isArray(b.transactions)) setExpenses(b.transactions);
    setRecurringRules(Array.isArray(b.recurringRules) ? b.recurringRules : []);
    if (Array.isArray(b.categories)) setCategories(b.categories);
    if (Array.isArray(b.incomeCategories)) setIncomeCategories(b.incomeCategories);
    if (Array.isArray(b.sources)) setSources(b.sources);
    if (b.settings) {
      if (typeof b.settings.currency === 'string') setUserCurrency(b.settings.currency);
      if (typeof b.settings.userName === 'string') setUserName(b.settings.userName);
      if (typeof b.settings.defaultSourceExpense === 'string') setDefaultSourceExpense(b.settings.defaultSourceExpense);
      if (typeof b.settings.defaultSourceIncome === 'string') setDefaultSourceIncome(b.settings.defaultSourceIncome);
    }
    setRefreshKey((prev) => prev + 1);
    setCurrentTab('dashboard');
    track('backup_restored', { count });
    toast.success('Backup restored', {
      description: `${count} transaction${count === 1 ? '' : 's'} loaded`,
      duration: 2000,
    });
  };

  // Import a lightweight JSON payload (see lib/importData). Resolves category
  // names against the user's own categories, adds any new subcategories, and
  // prepends the transactions. A full backup file (from Export) is restored
  // instead. Persists + cloud-syncs via the usual effects.
  const handleImportData = (payload: ImportPayload) => {
    // Full backup? Restore everything rather than appending.
    const p = payload as any;
    if (isBackupFile(p)) {
      restoreBackup(p);
      return { added: 0, defaulted: 0, skipped: [] };
    }
    const res = buildImport(payload, categories, incomeCategories, userCurrency);
    if (res.added === 0) {
      toast.error('Nothing imported', {
        description: res.skipped.length ? `${res.skipped.length} rows couldn't be matched` : 'No transactions found in the file',
        duration: 2200,
      });
      return res;
    }
    setCategories(res.categories);
    saveCategories(res.categories);
    setIncomeCategories(res.incomeCategories);
    saveIncomeCategories(res.incomeCategories);
    setExpenses((prev) => [...res.transactions, ...prev]);
    setRefreshKey((prev) => prev + 1);
    setCurrentTab('dashboard');
    track('data_imported', { count: res.added });
    const notes: string[] = [];
    if (res.defaulted) notes.push(`${res.defaulted} set to Others`);
    if (res.skipped.length) notes.push(`${res.skipped.length} skipped`);
    toast.success(`Imported ${res.added} transaction${res.added === 1 ? '' : 's'}`, {
      description: notes.length ? notes.join(' · ') : 'Added to your account',
      duration: 2000,
    });
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
    setCurrentTab('dashboard');
    setHasCompletedOnboarding(false);
    setHasSeenIntro(false);
  };

  const handleEraseAllData = async () => {
    if (userId) {
      // Erasing must clear the cloud copy too, or the next sign-in silently
      // resurrects the "erased" data. Refuse rather than half-erase.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast.error("You're offline", {
          description: 'Erasing also clears your cloud backup, which needs a connection. Try again when back online.',
          duration: 3200,
        });
        return;
      }
      setCloudHydrated(false); // stop write-through from re-saving during teardown
      try {
        await deleteCloud(userId);
      } catch {
        setCloudHydrated(true);
        toast.error("Couldn't erase your cloud data", {
          description: 'Check your connection and try again.',
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
    setUserCurrency(newCurrency);
    setRefreshKey(prev => prev + 1); // Force refresh of dashboard
    
    toast.success(`Currency updated to ${newCurrency}`, {
      description: 'New transactions will use this currency',
      duration: 1400,
    });
  };

  const handleUserNameChange = (newName: string) => {
    setUserName(newName);
    toast.success('Name updated successfully', {
      duration: 1400,
    });
  };

  // While the session (and, when signed in, the cloud data) is resolving, show
  // a minimal splash so we don't flash the sign-in or onboarding screens.
  const splash = (label?: string) => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor: '#F5F5F7' }}>
      <TracklyLogo size={64} />
      {label && <p style={{ color: '#8E8E93', fontSize: 14 }}>{label}</p>}
    </div>
  );

  if (authLoading) return splash();

  // Not signed in and not using the app locally → sign-in screen
  if (!session && !guest) return <Suspense fallback={splash()}><SignIn /></Suspense>;

  // Signed in but the account's data hasn't loaded yet
  if (session && !cloudHydrated) return splash('Loading your data…');

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

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F7' }}>
      <Toaster position="top-center" />
      
      {/* iPhone 14 Container — Activity needs an exact viewport height so only
          its transaction list scrolls; other tabs scroll as a whole page */}
      <div
        className={`max-w-[430px] mx-auto flex flex-col ${currentTab === 'activity' ? 'overflow-hidden' : 'min-h-screen'}`}
        style={{ backgroundColor: '#F5F5F7', ...(currentTab === 'activity' ? { height: '100dvh' } : {}) }}
      >
        {/* Status Bar Space — clears the iOS status bar when installed, minimal in a browser tab */}
        <div className="app-top-inset flex-shrink-0" style={{ backgroundColor: '#F5F5F7' }} />

        {/* Content - Different structure for activity tab vs others */}
        {currentTab === 'activity' ? (
          <Activity
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
            <Suspense fallback={null}>
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
                view="trend"
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
                userName={userName}
                onUserNameChange={handleUserNameChange}
                onLoadDemoData={handleLoadDemoData}
                onEraseAllData={handleEraseAllData}
                onEraseDemoData={handleEraseDemoData}
                hasDemoData={hasDemoData}
                onImportData={handleImportData}
                onExportData={handleExportData}
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
        
        {/* Bottom Navigation Bar - Only show when NOT in Add mode AND no modals are open */}
        {currentTab !== 'add' && !isModalOpen && (
          <div
            className="fixed bottom-0 left-0 right-0 z-40"
            style={{
              background: 'rgba(28, 28, 30, 0.92)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              // Lift labels clear of the home indicator AND the rounded screen
              // corners (which otherwise clip the outer Dashboard/Settings labels)
              paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
              paddingTop: '11px',
              // Straight top edge (no rounded corners)
              borderTopLeftRadius: '0px',
              borderTopRightRadius: '0px',
              boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-[430px] mx-auto grid grid-cols-5 items-center px-6">
              <button
                onClick={() => {
                  setDashboardInitialPeriod(null); // direct visits start on the current month
                  dashboardViewRef.current = null; // ...and from the top-level view
                  setCurrentTab('dashboard');
                }}
                className="flex flex-col items-center gap-1 transition-all pointer-events-auto justify-self-center"
              >
                <BarChart3
                  size={24}
                  style={{ color: currentTab === 'dashboard' ? '#FFFFFF' : '#8E8E93' }}
                  strokeWidth={currentTab === 'dashboard' ? 2.5 : 2}
                />
                <span
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{ color: currentTab === 'dashboard' ? '#FFFFFF' : '#8E8E93' }}
                >
                  Dashboard
                </span>
              </button>
              <button
                onClick={() => setCurrentTab('activity')}
                className="flex flex-col items-center gap-1 transition-all pointer-events-auto justify-self-center"
              >
                <List
                  size={24}
                  style={{ color: currentTab === 'activity' ? '#FFFFFF' : '#8E8E93' }}
                  strokeWidth={currentTab === 'activity' ? 2.5 : 2}
                />
                <span
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{ color: currentTab === 'activity' ? '#FFFFFF' : '#8E8E93' }}
                >
                  Activity
                </span>
              </button>
              <button
                onClick={() => {
                  setCurrentTab('add');
                  setSelectedTransactionCurrency(userCurrency); // Initialize with user's default currency
                }}
                aria-label="Add transaction"
                className="flex flex-col items-center pointer-events-auto justify-self-center"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95"
                  style={{
                    backgroundColor: '#FFFFFF',
                    boxShadow: '0 4px 16px rgba(255, 255, 255, 0.3)'
                  }}
                >
                  <Plus size={24} style={{ color: '#1C1C1E' }} strokeWidth={2.5} />
                </div>
              </button>
              <button
                onClick={() => setCurrentTab('trend')}
                className="flex flex-col items-center gap-1 transition-all pointer-events-auto justify-self-center"
              >
                <TrendingUp
                  size={24}
                  style={{ color: currentTab === 'trend' ? '#FFFFFF' : '#8E8E93' }}
                  strokeWidth={currentTab === 'trend' ? 2.5 : 2}
                />
                <span
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{ color: currentTab === 'trend' ? '#FFFFFF' : '#8E8E93' }}
                >
                  Trend
                </span>
              </button>
              <button 
                onClick={() => setCurrentTab('settings')} 
                className="flex flex-col items-center gap-1 transition-all pointer-events-auto justify-self-center"
              >
                <SettingsIcon 
                  size={24} 
                  style={{ color: currentTab === 'settings' ? '#FFFFFF' : '#8E8E93' }} 
                  strokeWidth={currentTab === 'settings' ? 2.5 : 2} 
                />
                <span 
                  className="text-[10px] font-medium whitespace-nowrap" 
                  style={{ color: currentTab === 'settings' ? '#FFFFFF' : '#8E8E93' }}
                >
                  Settings
                </span>
              </button>
            </div>
          </div>
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
              {/* Transaction Type Switch */}
              <div className="px-6 pb-5">
                <div 
                  className="inline-flex gap-0 rounded-lg overflow-hidden"
                  style={{ 
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E5E5EA'
                  }}
                >
                  <button
                    onClick={() => handleTransactionTypeChange('expense')}
                    className="px-4 py-1.5 transition-all text-sm font-medium"
                    style={{
                      backgroundColor: transactionType === 'expense' ? '#FFE8E6' : 'transparent',
                      color: transactionType === 'expense' ? '#D32F2F' : '#8E8E93',
                      borderRight: '1px solid #E5E5EA'
                    }}
                  >
                    Expense
                  </button>
                  <button
                    onClick={() => handleTransactionTypeChange('income')}
                    className="px-4 py-1.5 transition-all text-sm font-medium"
                    style={{
                      backgroundColor: transactionType === 'income' ? '#E8F5E9' : 'transparent',
                      color: transactionType === 'income' ? '#2E7D32' : '#8E8E93'
                    }}
                  >
                    Income
                  </button>
                </div>
              </div>

              <AmountInput
                value={amount}
                onChange={setAmount}
                currency={selectedTransactionCurrency}
                onCurrencyChange={setSelectedTransactionCurrency}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowSourceSelector(true)}
                    className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1 active:scale-95 transition-transform"
                    style={{ backgroundColor: '#F2F2F7', WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Select source"
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
                    Added automatically by your recurring schedule. Edits change only this occurrence.
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
            title="Save changes?"
            message="This transaction repeats. Apply your changes to just this one, or to this one and the future ones?"
            onlyThisLabel="Only this transaction"
            futureLabel="This and future ones"
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
            title="Delete recurring transaction?"
            message="This transaction repeats. Delete just this one, or this one and stop the schedule from here on?"
            onlyThisLabel="Only this transaction"
            futureLabel="This and future ones"
            onOnlyThis={() => confirmRecurringDelete('one')}
            onFuture={() => confirmRecurringDelete('future')}
            onCancel={() => setPendingRecurringDelete(null)}
          />
        </div>
      )}
    </div>
  );
}