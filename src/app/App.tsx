import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { BarChart3, Plus, List, X, Settings as SettingsIcon, TrendingUp } from 'lucide-react';
import { CURRENCIES } from './utils/currency';
import type { Transaction } from './types';
import {
  clearAllData,
  loadCategories,
  loadIncomeCategories,
  loadSettings,
  loadTransactions,
  saveCategories,
  saveIncomeCategories,
  saveSettings,
  saveTransactions,
} from './lib/storage';
import { getDemoTransactions } from './lib/demoData';
import { buildBackup, downloadBackup, type BackupFile } from './lib/backup';
import { Dashboard } from './components/Dashboard';
import { Activity } from './components/Activity';
import { Settings } from './components/Settings';
import { AmountInput } from './components/AmountInput';
import { DateInput } from './components/DateInput';
import { CategorySelector } from './components/CategorySelector';
import { SubcategorySelector } from './components/SubcategorySelector';
import { SaveButton } from './components/SaveButton';
import { DescriptionInput } from './components/DescriptionInput';
import { Onboarding } from './components/Onboarding';
import { categories as initialCategories, incomeCategories as initialIncomeCategories } from './components/categories';

export default function App() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => loadSettings().onboarded);
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
    saveSettings({ onboarded: hasCompletedOnboarding, userName, currency: userCurrency });
  }, [hasCompletedOnboarding, userName, userCurrency]);

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

    // Store original values for change detection
    setOriginalValues({
      amount: expense.amount.toString(),
      description: expense.description,
      date: expense.date,
      category: expense.category.id,
      subcategory: expense.subcategory || null,
      type: expense.type || 'expense',
      currency: expense.currency || userCurrency,
      recurrence: expense.recurrence || 'Never repeat'
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
              recurrence: recurrence // Add recurrence
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
        recurrence: recurrence // Add recurrence
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
  
  // Handle transaction type switch
  const handleTransactionTypeChange = (newType: 'expense' | 'income') => {
    setTransactionType(newType);
    // Reset category selection when switching types
    setSelectedCategory(null);
    setSelectedSubcategory(null);
  };
  
  // Check if anything has changed (for edit mode)
  const hasChanges = editingExpenseId && originalValues
    ? amount !== originalValues.amount ||
      description !== originalValues.description ||
      date !== originalValues.date ||
      selectedCategory !== originalValues.category ||
      selectedSubcategory !== originalValues.subcategory ||
      selectedTransactionCurrency !== originalValues.currency ||
      recurrence !== originalValues.recurrence
    : true;
  
  const canSave = amount && parseFloat(amount) > 0 && selectedCategory && hasChanges;

  const handleOnboardingComplete = (name: string, currency: string) => {
    setUserName(name);
    setUserCurrency(currency);
    setHasCompletedOnboarding(true);
  };

  // Demo data (for testing) — replaces current transactions with date-shifted samples
  const handleLoadDemoData = () => {
    setExpenses(getDemoTransactions(userCurrency));
    setRefreshKey(prev => prev + 1);
    setCurrentTab('dashboard');
    toast.success('Demo data loaded', {
      description: 'Sample transactions for testing the app',
      duration: 1400,
    });
  };

  // Export everything to a JSON file the user can keep as a backup
  const handleExportData = () => {
    downloadBackup(
      buildBackup({
        userName,
        currency: userCurrency,
        transactions: expenses,
        categories,
        incomeCategories,
      })
    );
    toast.success('Backup downloaded', {
      description: 'Keep this file safe to restore later',
      duration: 1800,
    });
  };

  // Replace all data with the contents of a validated backup file
  const handleImportData = (backup: BackupFile) => {
    setExpenses(backup.transactions);
    setCategories(backup.categories);
    setIncomeCategories(backup.incomeCategories);
    if (backup.userName) setUserName(backup.userName);
    if (backup.currency) setUserCurrency(backup.currency);
    setRefreshKey(prev => prev + 1);
    setCurrentTab('dashboard');
    toast.success('Backup restored', {
      description: `${backup.transactions.length} transaction${backup.transactions.length !== 1 ? 's' : ''} imported`,
      duration: 1800,
    });
  };

  // Full reset: wipe storage and restart from onboarding
  const handleEraseAllData = () => {
    clearAllData();
    setExpenses([]);
    setCategories(initialCategories);
    setIncomeCategories(initialIncomeCategories);
    setUserName('');
    setUserCurrency('EUR');
    setCurrentTab('dashboard');
    setHasCompletedOnboarding(false);
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

  // Show onboarding if not completed
  if (!hasCompletedOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
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
                onExportData={handleExportData}
                onImportData={handleImportData}
              />
            )}
          </div>
        )}
        
        {/* Bottom Navigation Bar - Only show when NOT in Add mode AND no modals are open */}
        {currentTab !== 'add' && !isModalOpen && (
          <div
            className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
            style={{
              background: 'rgba(28, 28, 30, 0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              // Keep labels above the home indicator without stacking the full
              // inset under them — matches native tab bar height on iPhone
              paddingBottom: 'max(6px, calc(env(safe-area-inset-bottom) - 10px))',
              paddingTop: '8px',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
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
                  size={22}
                  style={{ color: currentTab === 'dashboard' ? '#FFFFFF' : '#8E8E93' }}
                  strokeWidth={currentTab === 'dashboard' ? 2.5 : 2}
                />
                <span
                  className="text-[10px] font-medium"
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
                  size={22}
                  style={{ color: currentTab === 'activity' ? '#FFFFFF' : '#8E8E93' }}
                  strokeWidth={currentTab === 'activity' ? 2.5 : 2}
                />
                <span
                  className="text-[10px] font-medium"
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
                  className="w-11 h-11 rounded-full flex items-center justify-center transition-transform active:scale-95"
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
                  size={22}
                  style={{ color: currentTab === 'trend' ? '#FFFFFF' : '#8E8E93' }}
                  strokeWidth={currentTab === 'trend' ? 2.5 : 2}
                />
                <span
                  className="text-[10px] font-medium"
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
                  size={22} 
                  style={{ color: currentTab === 'settings' ? '#FFFFFF' : '#8E8E93' }} 
                  strokeWidth={currentTab === 'settings' ? 2.5 : 2} 
                />
                <span 
                  className="text-[10px] font-medium" 
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
              />
              
              {selectedCategory && (
                <SubcategorySelector
                  subcategories={subcategories}
                  selectedSubcategory={selectedSubcategory}
                  onSelectSubcategory={setSelectedSubcategory}
                />
              )}
            </div>

            {/* Fixed Save Button at Bottom */}
            <SaveButton
              onClick={handleSave}
              disabled={!canSave}
              isEditing={!!editingExpenseId}
              transactionType={transactionType}
            />
          </div>
        )}
      </div>
    </div>
  );
}