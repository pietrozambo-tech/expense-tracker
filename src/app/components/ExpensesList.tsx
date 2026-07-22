import { useState, useEffect } from 'react';
import { FilterBar } from './FilterBar';
import { DayGroup } from './DayGroup';
import { CategoryFilterModal } from './CategoryFilterModal';
import { SubcategoryFilterModal } from './SubcategoryFilterModal';
import { SearchModal } from './SearchModal';
import { formatAmount, CURRENCIES, convertAmount } from '../utils/currency';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: any;
  subcategory?: string;
  date: string;
  currency?: string;
}

interface ExpensesListProps {
  expenses: Expense[];
  onEditExpense: (id: string) => void;
  onDeleteExpense: (id: string) => void;
  onModalOpenChange?: (isOpen: boolean) => void;
  categories: any[];
  currency: string;
}

export function ExpensesList({ expenses, onEditExpense, onDeleteExpense, onModalOpenChange, categories, currency }: ExpensesListProps) {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = now.toLocaleString('en-US', { month: 'short' });
  
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [subcategoryFilter, setSubcategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  
  // CSV Export function
  const downloadExpenses = () => {
    if (filteredExpenses.length === 0) {
      toast.error('No expenses to export');
      return;
    }

    // Create CSV content
    const currencyName = CURRENCIES[currency]?.code || 'EUR';
    const headers = ['Date', 'Description', 'Category', 'Subcategory', `Amount (${currencyName})`, 'Recurrence'];
    const csvRows = [headers.join(',')];
    
    filteredExpenses.forEach(expense => {
      // Convert amount to default currency if needed
      const transactionCurrency = expense.currency || currency;
      const convertedAmount = convertAmount(expense.amount, transactionCurrency, currency);
      
      const row = [
        expense.date,
        `"${expense.description}"`, // Quote to handle commas in description
        expense.category.name,
        expense.subcategory || '',
        `"${convertedAmount.toFixed(2).replace('.', ',')}"`, // Quote the amount to preserve comma decimal separator
        (expense as any).recurrence || 'Never repeat'
      ];
      csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `expenses_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Exported ${filteredExpenses.length} expense${filteredExpenses.length !== 1 ? 's' : ''}`);
  };
  
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);
  const [isMonthModalOpen, setIsMonthModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSubcategoryModalOpen, setIsSubcategoryModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Helper to parse YYYY-MM-DD to local Date object safely
  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Get available years from expenses (only years with data)
  const getAvailableYears = () => {
    const years = new Set<string>();
    expenses.forEach(expense => {
      const expenseDate = parseLocalDate(expense.date);
      years.add(String(expenseDate.getFullYear()));
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)); // Sort descending
  };

  // Get available months for the selected year (only months with data)
  const getAvailableMonths = () => {
    const year = parseInt(selectedYear);
    const monthsSet = new Set<number>();
    
    expenses.forEach(expense => {
      const expenseDate = parseLocalDate(expense.date);
      if (expenseDate.getFullYear() === year) {
        monthsSet.add(expenseDate.getMonth());
      }
    });
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Array.from(monthsSet)
      .sort((a, b) => a - b) // Sort by month number
      .map(monthIndex => monthNames[monthIndex]);
  };

  const availableYears = getAvailableYears();
  const availableMonths = getAvailableMonths();

  // Auto-adjust selected month if it doesn't exist in the selected year
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth) && selectedMonth !== 'Full Year') {
      setSelectedMonth('Full Year'); // Default to Full Year if selected month doesn't exist
    }
  }, [selectedYear, availableMonths, selectedMonth]);

  // Get date range based on selected year and month
  const getDateRange = () => {
    const year = parseInt(selectedYear);
    
    // Handle Full Year option
    if (selectedMonth === 'Full Year') {
      const start = new Date(year, 0, 1); // January 1st
      const end = new Date(year, 11, 31, 23, 59, 59); // December 31st
      return { start, end };
    }
    
    const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(selectedMonth);
    
    let start: Date;
    let end: Date;
    
    if (!isNaN(year) && monthIndex !== -1) {
      start = new Date(year, monthIndex, 1);
      end = new Date(year, monthIndex + 1, 0, 23, 59, 59);
    } else {
      // Fallback to current month
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    
    return { start, end };
  };

  // Filter expenses based on selected filters
  const filteredExpenses = expenses.filter((expense) => {
    // Period filter
    const { start, end } = getDateRange();
    const expenseDate = parseLocalDate(expense.date);
    if (expenseDate < start || expenseDate > end) {
      return false;
    }
    
    // Category filter
    if (categoryFilter !== 'All' && expense.category.name !== categoryFilter) {
      return false;
    }
    
    // Subcategory filter
    if (subcategoryFilter !== 'All' && expense.subcategory !== subcategoryFilter) {
      return false;
    }
    
    // Search filter
    if (searchQuery && !expense.description.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Type filter (recurrence)
    if (typeFilter === 'One-off') {
      const recurrence = (expense as any).recurrence || 'Never repeat';
      if (recurrence !== 'Never repeat') {
        return false;
      }
    }
    if (typeFilter === 'Recurrent') {
      const recurrence = (expense as any).recurrence || 'Never repeat';
      if (recurrence === 'Never repeat') {
        return false;
      }
    }
    
    return true;
  });

  // Get available subcategories based on selected category
  const getAvailableSubcategories = () => {
    if (categoryFilter === 'All') {
      // Get all unique subcategories from all expenses
      const allSubcats = new Set<string>();
      expenses.forEach(expense => {
        if (expense.subcategory) {
          allSubcats.add(expense.subcategory);
        }
      });
      return Array.from(allSubcats).sort();
    } else {
      // Get subcategories for the selected category
      const category = categories.find(c => c.name === categoryFilter);
      return category?.subcategories || [];
    }
  };

  // Reset subcategory when category changes
  const handleCategoryChange = (category: string) => {
    setCategoryFilter(category);
    setSubcategoryFilter('All');
  };

  // Group expenses by date
  const groupedExpenses = filteredExpenses.reduce((groups, expense) => {
    const date = expense.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(expense);
    return groups;
  }, {} as Record<string, typeof expenses>);

  const totalExpenses = filteredExpenses.length;
  const totalAmount = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  const handleExpenseTap = (id: string) => {
    onEditExpense(id);
  };

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Fixed Header - Always Visible */}
      <div className="flex-shrink-0 pt-0" style={{ backgroundColor: '#F5F5F7' }}>
        <div className="px-6 pb-6 flex items-center justify-between">
          <div className="flex-1">
            <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>Full Expenses</h1>
            <p style={{ color: '#8E8E93', fontSize: '14px', marginTop: '4px' }}>
              {totalExpenses} transaction{totalExpenses !== 1 ? 's' : ''} · {formatAmount(totalAmount, currency)}
            </p>
          </div>
          {filteredExpenses.length > 0 && (
            <button
              onClick={downloadExpenses}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors active:bg-neutral-200"
              style={{ backgroundColor: '#F2F2F7' }}
            >
              <Download size={18} style={{ color: '#1C1C1E' }} />
            </button>
          )}
        </div>

        {/* Filter Bar - Always Visible */}
        <FilterBar
          year={selectedYear}
          month={selectedMonth}
          category={categoryFilter}
          subcategory={subcategoryFilter}
          searchQuery={searchQuery}
          typeFilter={typeFilter}
          availableYears={availableYears}
          availableMonths={availableMonths}
          onYearChange={(year) => setSelectedYear(year)}
          onMonthChange={(month) => setSelectedMonth(month)}
          onOpenCategorySelector={() => {
            setIsCategoryModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onOpenSubcategorySelector={() => {
            setIsSubcategoryModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onOpenSearch={() => {
            setIsSearchModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onClearSearch={() => setSearchQuery('')}
          onTypeFilterChange={(type) => setTypeFilter(type)}
        />
      </div>

      {/* Scrollable Expense List */}
      <div className="flex-1 overflow-y-auto pt-2 pb-24">
        {Object.entries(groupedExpenses).length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-neutral-400 text-sm mb-2">No expenses found</div>
            <p className="text-neutral-500 text-xs">
              {searchQuery ? 'Try a different search term' : 'Change your filters or add a new expense'}
            </p>
          </div>
        ) : (
          Object.entries(groupedExpenses)
            .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime())
            .map(([date, dayExpenses]) => (
            <DayGroup 
              key={date} 
              date={date} 
              expenses={dayExpenses}
              onExpenseTap={onEditExpense}
              onDeleteExpense={onDeleteExpense}
              currency={currency}
            />
          ))
        )}
      </div>

      {/* Modals */}
      <CategoryFilterModal
        isOpen={isCategoryModalOpen}
        selectedCategory={categoryFilter}
        onClose={() => {
          setIsCategoryModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onSelectCategory={(newCategory) => {
          handleCategoryChange(newCategory);
          setIsCategoryModalOpen(false);
          onModalOpenChange?.(false);
        }}
        categories={categories}
        incomeCategories={[]}
      />

      <SubcategoryFilterModal
        isOpen={isSubcategoryModalOpen}
        selectedSubcategory={subcategoryFilter}
        onClose={() => {
          setIsSubcategoryModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onSelectSubcategory={(newSubcategory) => {
          setSubcategoryFilter(newSubcategory);
          setIsSubcategoryModalOpen(false);
          onModalOpenChange?.(false);
        }}
        availableSubcategories={getAvailableSubcategories()}
      />

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => {
          setIsSearchModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onSearch={(query) => {
          setSearchQuery(query);
          setIsSearchModalOpen(false);
          onModalOpenChange?.(false);
        }}
      />
    </div>
  );
}