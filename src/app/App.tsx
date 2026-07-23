import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { BarChart3, Plus, List, X, Settings as SettingsIcon, TrendingUp, ChevronDown } from 'lucide-react';
import { CURRENCIES } from './utils/currency';
import type { Transaction, Source } from './types';
import {
  clearAllData,
  loadCategories,
  loadIncomeCategories,
  loadSettings,
  loadSources,
  loadTransactions,
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
import { Dashboard } from './components/Dashboard';
import { Activity } from './components/Activity';
import { Settings } from './components/Settings';
import { AmountInput } from './components/AmountInput';
import { DateInput } from './components/DateInput';
import { CategorySelector } from './components/CategorySelector';
import { SaveButton } from './components/SaveButton';
import { DescriptionInput } from './components/DescriptionInput';
import { Onboarding } from './components/Onboarding';
import { WelcomeCarousel } from './components/WelcomeCarousel';
import { useAuth } from './auth/AuthProvider';
import { SignIn } from './auth/SignIn';
import { loadCloud, saveCloud, type SyncPayload } from './lib/cloud';
import { categories as initialCategories, incomeCategories as initialIncomeCategories } from './components/categories';

export default function App() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => loadSettings().onboarded);
  const [hasSeenIntro, setHasSeenIntro] = useState(() => loadSettings().hasSeenIntro ?? false);
  const [userName, setUserName] = useState(() => loadSettings().userName);
  const [userCurrency, setUserCurrency] = useState(() => loadSettings().currency);
  const [selectedTransactionCurrency, setSelectedTransactionCurrency] = useState('EUR'); // Currency for current transaction being added/edited
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'activity' | 'add' | 'trend' | 'settings'>('dashboard');
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
  const [returnToTab, setReturnToTab] = useState<'dashboard' | 'activity' | 'trend' | 'settings' | 'add'>('dashboard'); // Track which tab to return to after editing
  // Set when a Trend month is tapped so the Overview opens on that period
  const [dashboardInitialPeriod, setDashboardInitialPeriod] = useState<{ month: number; year: number; type: 'expense' | 'income' } | null>(null);
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
  const { session, loading: authLoading, guest, signOut, leaveGuest } = useAuth();
  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? null;
  const [cloudHydrated, setCloudHydrated] = useState(false);
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
    saveSettings({
      onboarded: hasCompletedOnboarding,
      userName,
      currency: userCurrency,
      hasSeenIntro,
      defaultSourceExpense,
      defaultSourceIncome,
    });
  }, [hasCompletedOnboarding, userName, userCurrency, hasSeenIntro, defaultSourceExpense, defaultSourceIncome]);

  // Snapshot the whole app state into the cloud payload shape
  const buildPayload = (): SyncPayload => ({
    transactions: expenses,
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
    const payload = buildPayload();
    const t = setTimeout(() => {
      saveCloud(userId, payload).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cloudHydrated, expenses, categories, incomeCategories, sources, hasCompletedOnboarding, userName, userCurrency, hasSeenIntro, defaultSourceExpense, defaultSourceIncome]);

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
      // Update existing expense (now updates currency if changed)
      setExpenses(expenses.map(expense => 
        expense.id === editingExpenseId
          ? {
              ...expense,
              description: description || categoryData?.name || (transactionType === 'expense' ? 'Expense' : 'Income'),
              amount: parseFloat(amount),
              category: categoryData!,
              subcategory: selectedSubcategory || undefined,
              date: date,
              type: transactionType,
              currency: selectedTransactionCurrency, // Update currency when editing
              recurrence: recurrence, // Add recurrence
              sourceId: selectedSourceId || undefined
            }
          : expense
      ));
      
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
        recurrence: recurrence, // Add recurrence
        sourceId: selectedSourceId || undefined
      };

      // Add to expenses list
      setExpenses([newExpense, ...expenses]);
      
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
    
    // Return to the tab we came from when editing, or go to dashboard for new transactions
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
    setCategories(categories.filter(cat => cat.id !== id));
    
    // Unlink expenses from deleted category
    setExpenses(expenses.map(expense => 
      expense.category.id === id 
        ? { ...expense, category: { ...expense.category, id: 'others' } }
        : expense
    ));
    
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
    setIncomeCategories(incomeCategories.filter(cat => cat.id !== id));
    
    // For income transactions, we might want to handle this differently
    // since there's no "others" category for income. We could just remove the reference.
    setExpenses(expenses.filter(expense => 
      !(expense.type === 'income' && expense.category.id === id)
    ));
    
    setRefreshKey(prev => prev + 1);
    toast.success('Income category deleted', {
      duration: 1400,
    });
  };

  const handleDeleteExpense = (id: string) => {
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

  const handleOnboardingComplete = (name: string, currency: string) => {
    setUserName(name);
    setUserCurrency(currency);
    setHasCompletedOnboarding(true);
  };

  // Demo data (for testing) — replaces current transactions with date-shifted
  // samples, assigning each a random source so the field is populated
  const handleLoadDemoData = () => {
    const demo = getDemoTransactions(userCurrency).map((t) => ({
      ...t,
      sourceId: sources.length
        ? sources[Math.floor(Math.random() * sources.length)].id
        : undefined,
    }));
    setExpenses(demo);
    setRefreshKey(prev => prev + 1);
    setCurrentTab('dashboard');
    toast.success('Demo data loaded', {
      description: 'Sample transactions for testing the app',
      duration: 1400,
    });
  };

  // Full reset: wipe storage and restart from onboarding
  const handleEraseAllData = () => {
    clearAllData();
    setExpenses([]);
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
      <div className="flex items-center justify-center rounded-3xl" style={{ width: 72, height: 72, background: '#FFFFFF', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', fontSize: 38 }}>💸</div>
      {label && <p style={{ color: '#8E8E93', fontSize: 14 }}>{label}</p>}
    </div>
  );

  if (authLoading) return splash();

  // Not signed in and not using the app locally → sign-in screen
  if (!session && !guest) return <SignIn />;

  // Signed in but the account's data hasn't loaded yet
  if (session && !cloudHydrated) return splash('Loading your data…');

  // Show onboarding if not completed
  if (!hasCompletedOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // First run after name + currency: show the feature carousel once
  if (!hasSeenIntro) {
    return (
      <WelcomeCarousel
        userName={userName}
        onDone={() => setHasSeenIntro(true)}
        onSetupCategories={() => {
          setHasSeenIntro(true);
          setCurrentTab('settings');
          setOpenCategoriesOnSettings(true);
        }}
      />
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
          <div className="flex-1 overflow-y-auto pb-32">
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
                isGuest={guest}
                onSignOut={async () => { await signOut(); }}
                onSignInToSync={leaveGuest}
              />
            )}
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
    </div>
  );
}