import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ArrowUpDown, TrendingUp, TrendingDown, Minus, Plus, Receipt, ChevronLeft, ChevronDown, X, Clock, Wallet, Percent } from 'lucide-react';
import { TrendCategoryBreakdown } from './TrendCategoryBreakdown';
import React from 'react';
import { formatAmount, formatCompactAmount, formatSummaryAmount, formatAmountListView, formatAbbreviatedAmount, CURRENCIES, homeAmount } from '../utils/currency';
import { getCategoryIcon } from './categoryIcons';
import { BudgetBar, BudgetNudge } from './BudgetBar';
import { FitText } from './FitText';
import { parseLocalDate } from '../lib/dates';
import { CategoryFilterModal } from './CategoryFilterModal';
import { SubcategoryFilterModal } from './SubcategoryFilterModal';
import { SourceLogo } from './SourceLogo';
import type { Source } from '../types';

import { ActivityDayGroup } from './ActivityDayGroup';
import { ExpenseItem } from './ExpenseItem';
import { IncomeItem } from './IncomeItem';

type ViewType = 'current-month' | 'trend';
type CategorySortType = 'alphabetical' | 'amount';
type TimePeriodType = 'month' | 'quarter' | 'year';
type TransactionType = 'expense' | 'income' | 'savings';

// The greeting shows once per app launch (page load): reloading or reopening
// the installed app replays it, switching tabs within a session does not.
let greetingShownThisLaunch = false;

// Pick a "nice" axis top and step for the range [0, maxValue] so the y-axis
// shows round labels (0, 250, 500, …) instead of raw fractions of the data max.
function niceAxis(maxValue: number, targetTicks = 5): { max: number; step: number } {
  if (!isFinite(maxValue) || maxValue <= 0) return { max: 1, step: 1 };
  const rawStep = maxValue / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag; // 1..10
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  return { max: Math.ceil(maxValue / step) * step, step };
}

// Compact y-axis tick label: full number with separators up to 10k, then "Nk".
function formatAxisTick(value: number): string {
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  return Math.round(value).toLocaleString('en-US');
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: any;
  subcategory?: string;
  date: string;
  type?: 'expense' | 'income';
  currency?: string;
  recurrence?: string;
  sourceId?: string;
}

// Snapshot of the Overview's user selections, kept in a ref by App so the view
// survives the remount that happens when a transaction is edited (the tab
// switch unmounts Dashboard and refreshKey remounts it on return).
export interface DashboardViewState {
  timePeriodType: 'month' | 'quarter' | 'year';
  selectedMonth: number;
  selectedQuarter: number;
  selectedYear: number;
  transactionType: 'expense' | 'income' | 'savings';
  expandedCategory: string | null;
  drilldownContext: { categoryName: string; subcategoryName: string | null } | null;
  drilldownSortBy: 'time' | 'amount';
}

interface DashboardProps {
  expenses: Expense[];
  categories: any[];
  incomeCategories: any[];
  sources?: Source[];
  userName?: string;
  currency: string;
  onEditExpense: (id: string) => void;
  onDeleteExpense: (id: string) => void;
  view?: 'overview' | 'trend';
  // Trend months link back to the Overview tab with that period selected
  onShowOverview?: (period: { month: number; year: number; type: 'expense' | 'income' }) => void;
  initialPeriod?: { month: number; year: number; type: 'expense' | 'income' } | null;
  viewStateRef?: React.MutableRefObject<DashboardViewState | null>;
  monthlyBudget?: number;
  /** True once the user has waved away the "set a budget" card. */
  budgetNudgeDismissed?: boolean;
  onSetMonthlyBudget?: (value: number) => void;
  onDismissBudgetNudge?: () => void;
}

// Sentinel drilldown target: only the transactions with no subcategory
// ("Other"). Distinctive enough that it can't collide with a real
// subcategory name. (A null subcategory already means "all transactions".)
const UNCATEGORIZED = '__uncategorized__';

// Same treatment as the Overview hero card, so the headline numbers on both
// tabs look like they belong to the same app.
const TREND_STAT_CARD: React.CSSProperties = {
  background: 'linear-gradient(150deg, #2E2E32 0%, #1C1C1E 100%)',
  boxShadow: '0 12px 30px rgba(28, 28, 30, 0.22)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
};

// Headline number on the Trend tab. All three toggles use a pair of these, so
// switching between Expenses, Income and Savings moves nothing but the values.
//
// The footnote is where the supporting count goes (months, transactions,
// saving rate) - small, but at the same 10px as everywhere else in the app.
function TrendStatCard({
  label,
  value,
  compact,
  footnote,
  valueColor = '#FFFFFF',
}: {
  label: string;
  value: string;
  compact: string;
  footnote?: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="rounded-2xl px-4 py-3.5 flex flex-col min-w-0" style={TREND_STAT_CARD}>
      <div className="text-[11px] leading-tight mb-1.5" style={{ color: 'rgba(235,235,245,0.6)' }}>
        {label}
      </div>
      {/* No padding on this wrapper: FitText measures its parent's clientWidth,
          which would include the card's own padding. */}
      <div className="min-w-0">
        <FitText
          max={17}
          min={14}
          compact={compact}
          className="font-bold leading-none tabular-nums"
          style={{ color: valueColor }}
        >
          {value}
        </FitText>
      </div>
      {footnote && (
        <div className="text-[10px] leading-tight mt-2" style={{ color: 'rgba(235,235,245,0.55)' }}>
          {footnote}
        </div>
      )}
    </div>
  );
}

// Savings can be negative, and the sign is the whole point - so it is carried
// by colour as well as the minus, in the shades the Overview hero already uses.
const savingsColor = (value: number) => (value < 0 ? '#FF6961' : value > 0 ? '#30D158' : '#FFFFFF');

// Chip inside a TrendStatCard: a second, smaller number that rides along with
// the headline one. As plain footnote text the saving rate disappeared - the
// tinted panel gives it a frame of its own without competing with the total.
//
// Tint is kept at 0.12 rather than the 0.16 used for the Overview icons: at
// 0.16 the red-on-red contrast lands just under 4.5:1, and this text is small.
function StatChip({ label, value, tone }: { label: React.ReactNode; value: string; tone: number }) {
  return (
    // The negative margin is exactly the horizontal padding, so the label
    // inside the panel starts on the card's own content edge - lined up with
    // the card label above it, and with the plain-text footnote in the card
    // alongside. Without it the panel's padding indents the text by 8px and
    // the two cards read as misaligned.
    <span
      className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1 -mx-2"
      style={{
        backgroundColor:
          tone < 0 ? 'rgba(255,105,97,0.12)' : tone > 0 ? 'rgba(48,209,88,0.12)' : 'rgba(255,255,255,0.08)',
      }}
    >
      {/* Full width rather than hugging its content: on a narrow phone
          "Saving Rate -45%" does not fit on one line as a hugging chip, and
          wrapping mid-label looks broken. Split across the panel it fits. */}
      <span className="truncate" style={{ color: 'rgba(235,235,245,0.75)' }}>{label}</span>
      <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: savingsColor(tone) }}>
        {value}
      </span>
    </span>
  );
}

export function Dashboard({ expenses, categories, incomeCategories, sources = [], userName, currency, onEditExpense, onDeleteExpense, view = 'overview', onShowOverview, initialPeriod, viewStateRef, monthlyBudget, budgetNudgeDismissed, onSetMonthlyBudget, onDismissBudgetNudge }: DashboardProps) {
  // Restore the previous view (period + drilldown) unless a Trend->Overview
  // link supplied an explicit period - that must win and start clean.
  const savedView = view === 'overview' && !initialPeriod ? viewStateRef?.current ?? null : null;
  const viewType: ViewType = view === 'trend' ? 'trend' : 'current-month';
  const [timePeriodType, setTimePeriodType] = useState<TimePeriodType>(savedView?.timePeriodType ?? 'month');
  // Measure the cumulative chart's real pixel width so its SVG renders 1:1
  // (no aspect-ratio stretching that would deform the line dot / axis text).
  const chartBoxRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  useEffect(() => {
    const measure = () => {
      if (chartBoxRef.current) setChartWidth(chartBoxRef.current.clientWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
  const [expandedCategory, setExpandedCategory] = useState<string | null>(savedView?.expandedCategory ?? null);
  const [trendExpandedCategory, setTrendExpandedCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('All');
  const [categorySortBy, setCategorySortBy] = useState<CategorySortType>('alphabetical');
  const [drilldownSortBy, setDrilldownSortBy] = useState<'time' | 'amount'>(savedView?.drilldownSortBy ?? 'time');
  const [transactionType, setTransactionType] = useState<TransactionType>(initialPeriod?.type || savedView?.transactionType || 'expense');
  const [isTrendCategoryModalOpen, setIsTrendCategoryModalOpen] = useState(false);
  const [isTrendSubcategoryModalOpen, setIsTrendSubcategoryModalOpen] = useState(false);
  
  // State for drill-down modal
  const [drilldownContext, setDrilldownContext] = useState<{
    categoryName: string;
    subcategoryName: string | null;
  } | null>(savedView?.drilldownContext ?? null);
  
  // State for recurrence donut chart
  const [recurrenceLayer, setRecurrenceLayer] = useState<'overview' | 'detail'>('overview');
  const [selectedRecurrenceSlice, setSelectedRecurrenceSlice] = useState<string | null>(null);
  
  // State for manual tooltip positioning
  const [tooltipData, setTooltipData] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
  } | null>(null);
  
  // Track the specific period (month, quarter, or year)
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(initialPeriod?.month ?? savedView?.selectedMonth ?? now.getMonth()); // 0-11
  const [selectedQuarter, setSelectedQuarter] = useState<number>(savedView?.selectedQuarter ?? Math.floor((initialPeriod?.month ?? now.getMonth()) / 3)); // 0-3
  const [selectedYear, setSelectedYear] = useState<number>(initialPeriod?.year ?? savedView?.selectedYear ?? now.getFullYear());

  // Keep the snapshot current on every selection change (ref write - no
  // re-render). Trend view has its own instance and never touches it.
  useEffect(() => {
    if (view !== 'overview' || !viewStateRef) return;
    viewStateRef.current = {
      timePeriodType,
      selectedMonth,
      selectedQuarter,
      selectedYear,
      transactionType,
      expandedCategory,
      drilldownContext,
      drilldownSortBy,
    };
  }, [view, viewStateRef, timePeriodType, selectedMonth, selectedQuarter, selectedYear, transactionType, expandedCategory, drilldownContext, drilldownSortBy]);


  // Prevent background scroll when drilldown is open
  useEffect(() => {
    if (drilldownContext) {
      document.body.style.overflow = 'hidden';
      // Change status bar appearance for mobile by setting body background
      // This helps the status bar area match the dimmed overlay
      const originalBg = document.body.style.backgroundColor;
      document.body.style.backgroundColor = '#999999'; // Matches the dimmed bg-black/40 look
      
      return () => {
        document.body.style.overflow = '';
        document.body.style.backgroundColor = originalBg;
      };
    }
  }, [drilldownContext]);

  // Memoized drilldown transactions for performance and stability
  const drilldownTransactions = React.useMemo(() => {
    if (!drilldownContext) return [];

    const { categoryName, subcategoryName } = drilldownContext;
    
    // Get period range
    const periodStart = (() => {
      switch (timePeriodType) {
        case 'month': return new Date(selectedYear, selectedMonth, 1);
        case 'quarter': return new Date(selectedYear, selectedQuarter * 3, 1);
        case 'year': return new Date(selectedYear, 0, 1);
        default: return new Date(selectedYear, selectedMonth, 1);
      }
    })();
    
    const periodEnd = (() => {
      switch (timePeriodType) {
        case 'month': return new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
        case 'quarter': return new Date(selectedYear, (selectedQuarter + 1) * 3, 0, 23, 59, 59, 999);
        case 'year': return new Date(selectedYear, 11, 31, 23, 59, 59, 999);
        default: return new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
      }
    })();
    
    // Efficiency: filter first by type and period, then by category
    return expenses.filter(expense => {
      const typeMatch = transactionType === 'income' ? expense.type === 'income' : expense.type !== 'income';
      if (!typeMatch) return false;

      const expenseDate = parseLocalDate(expense.date);
      const inPeriod = expenseDate >= periodStart && expenseDate <= periodEnd;
      if (!inPeriod) return false;

      const categoryMatch = expense.category.name === categoryName;
      if (!categoryMatch) return false;

      // null → every transaction; UNCATEGORIZED → only those with no
      // subcategory; otherwise → an exact subcategory match.
      if (!subcategoryName) return true;
      if (subcategoryName === UNCATEGORIZED) return !expense.subcategory;
      return expense.subcategory === subcategoryName;
    });
  }, [drilldownContext, expenses, transactionType, timePeriodType, selectedYear, selectedMonth, selectedQuarter]);

  // Memoized list for the drilldown modal.
  // - amount mode: a single flat list ranked by amount (biggest first), each row
  //   shows its own date, so there are no day headers to break on cross-day sorting.
  // - time mode: grouped by day with the usual Today/Yesterday/date headers.
  const drilldownList = React.useMemo<
    | { mode: 'empty' }
    | { mode: 'amount'; items: Expense[] }
    | { mode: 'time'; groups: [string, Expense[]][] }
  >(() => {
    if (drilldownTransactions.length === 0) return { mode: 'empty' };

    if (drilldownSortBy === 'amount') {
      const items = [...drilldownTransactions].sort((a, b) => {
        const amountA = homeAmount(a, currency);
        const amountB = homeAmount(b, currency);
        return amountB - amountA;
      });
      return { mode: 'amount', items };
    }

    const grouped = drilldownTransactions.reduce((groups, txn) => {
      const date = txn.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(txn);
      return groups;
    }, {} as Record<string, Expense[]>);

    const groups = Object.entries(grouped)
      .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime());
    return { mode: 'time', groups };
  }, [drilldownTransactions, drilldownSortBy, currency]);
  
  // Get available years from expenses data
  const getAvailableYears = (): number[] => {
    if (expenses.length === 0) return [now.getFullYear()];
    
    const years = new Set<number>();
    expenses.forEach(expense => {
      const year = parseLocalDate(expense.date).getFullYear();
      years.add(year);
    });
    
    return Array.from(years).sort((a, b) => b - a); // Sort descending (newest first)
  };
  
  // Initialize trend year filter to most recent year with data
  const getMostRecentYearWithData = (): number => {
    const availableYears = getAvailableYears();
    return availableYears.length > 0 ? availableYears[0] : now.getFullYear();
  };
  
  const [trendYearFilter, setTrendYearFilter] = useState<number>(getMostRecentYearWithData()); // Year filter for Trend tab

  // Greeting: visible on app launch, collapses after 2s or on first interaction
  const [showGreeting, setShowGreeting] = useState(() => view === 'overview' && !greetingShownThisLaunch);

  useEffect(() => {
    if (!showGreeting) return;

    const collapse = () => {
      greetingShownThisLaunch = true;
      setShowGreeting(false);
    };

    const timer = setTimeout(collapse, 2000);
    window.addEventListener('scroll', collapse, { passive: true });
    window.addEventListener('touchstart', collapse, { passive: true });
    window.addEventListener('mousedown', collapse);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', collapse);
      window.removeEventListener('touchstart', collapse);
      window.removeEventListener('mousedown', collapse);
    };
  }, [showGreeting]);

  // Reset recurrence layer when switching transaction type or time period
  useEffect(() => {
    setRecurrenceLayer('overview');
    setSelectedRecurrenceSlice(null);
  }, [transactionType, timePeriodType, selectedMonth, selectedQuarter, selectedYear]);

  // Helper function to convert month name to month number (0-11)
  const getMonthNumber = (monthName: string): number => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.indexOf(monthName);
  };

  // Get current period expenses
  const getCurrentMonthExpenses = () => {
    let periodStart: Date;
    let periodEnd: Date;
    
    switch (timePeriodType) {
      case 'month':
        periodStart = new Date(selectedYear, selectedMonth, 1);
        periodEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
        break;
      case 'quarter':
        const quarterStartMonth = selectedQuarter * 3;
        periodStart = new Date(selectedYear, quarterStartMonth, 1);
        periodEnd = new Date(selectedYear, quarterStartMonth + 3, 0, 23, 59, 59, 999);
        break;
      case 'year':
        periodStart = new Date(selectedYear, 0, 1);
        periodEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
        break;
    }
    
    return expenses.filter(expense => {
      const expenseDate = parseLocalDate(expense.date);
      return expenseDate >= periodStart && expenseDate <= periodEnd;
    });
  };

  // Get previous period expenses
  const getPreviousPeriodExpenses = () => {
    let periodStart: Date;
    let periodEnd: Date;
    
    switch (timePeriodType) {
      case 'month':
        const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        periodStart = new Date(prevYear, prevMonth, 1);
        periodEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999);
        break;
      case 'quarter':
        const prevQuarter = selectedQuarter === 0 ? 3 : selectedQuarter - 1;
        const prevQuarterYear = selectedQuarter === 0 ? selectedYear - 1 : selectedYear;
        const prevQuarterStartMonth = prevQuarter * 3;
        periodStart = new Date(prevQuarterYear, prevQuarterStartMonth, 1);
        periodEnd = new Date(prevQuarterYear, prevQuarterStartMonth + 3, 0, 23, 59, 59, 999);
        break;
      case 'year':
        periodStart = new Date(selectedYear - 1, 0, 1);
        periodEnd = new Date(selectedYear - 1, 11, 31, 23, 59, 59, 999);
        break;
    }
    
    return expenses.filter(expense => {
      const expenseDate = parseLocalDate(expense.date);
      return expenseDate >= periodStart && expenseDate <= periodEnd;
    });
  };

  // Get period display name
  const getPeriodDisplayName = () => {
    switch (timePeriodType) {
      case 'month':
        const date = new Date(selectedYear, selectedMonth, 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'quarter':
        return `Q${selectedQuarter + 1} ${selectedYear}`;
      case 'year':
        return selectedYear.toString();
    }
  };

  // Navigate to previous period
  const navigatePrevious = () => {
    switch (timePeriodType) {
      case 'month':
        if (selectedMonth === 0) {
          setSelectedMonth(11);
          setSelectedYear(selectedYear - 1);
        } else {
          setSelectedMonth(selectedMonth - 1);
        }
        break;
      case 'quarter':
        if (selectedQuarter === 0) {
          setSelectedQuarter(3);
          setSelectedYear(selectedYear - 1);
        } else {
          setSelectedQuarter(selectedQuarter - 1);
        }
        break;
      case 'year':
        setSelectedYear(selectedYear - 1);
        break;
    }
    setExpandedCategory(null);
  };

  // Navigate to next period
  const navigateNext = () => {
    const currentPeriod = getCurrentPeriod();
    
    switch (timePeriodType) {
      case 'month':
        if (selectedYear < currentPeriod.year || 
            (selectedYear === currentPeriod.year && selectedMonth < currentPeriod.month)) {
          if (selectedMonth === 11) {
            setSelectedMonth(0);
            setSelectedYear(selectedYear + 1);
          } else {
            setSelectedMonth(selectedMonth + 1);
          }
        }
        break;
      case 'quarter':
        if (selectedYear < currentPeriod.year || 
            (selectedYear === currentPeriod.year && selectedQuarter < currentPeriod.quarter)) {
          if (selectedQuarter === 3) {
            setSelectedQuarter(0);
            setSelectedYear(selectedYear + 1);
          } else {
            setSelectedQuarter(selectedQuarter + 1);
          }
        }
        break;
      case 'year':
        if (selectedYear < currentPeriod.year) {
          setSelectedYear(selectedYear + 1);
        }
        break;
    }
    setExpandedCategory(null);
  };

  // Check if we're at the current period (to disable next button)
  const getCurrentPeriod = () => {
    const now = new Date();
    return {
      month: now.getMonth(),
      quarter: Math.floor(now.getMonth() / 3),
      year: now.getFullYear()
    };
  };

  const isAtCurrentPeriod = () => {
    const current = getCurrentPeriod();
    switch (timePeriodType) {
      case 'month':
        return selectedYear === current.year && selectedMonth === current.month;
      case 'quarter':
        return selectedYear === current.year && selectedQuarter === current.quarter;
      case 'year':
        return selectedYear === current.year;
    }
  };

  const currentMonthExpenses = getCurrentMonthExpenses();

  // Calculate spending, income, and savings for the period (with currency conversion)
  const periodExpenses = currentMonthExpenses.filter(e => e.type !== 'income');
  const periodIncome = currentMonthExpenses.filter(e => e.type === 'income');
  const totalSpending = periodExpenses.reduce((sum, e) => {
    const convertedAmount = homeAmount(e, currency);
    return sum + convertedAmount;
  }, 0);
  const totalIncome = periodIncome.reduce((sum, e) => {
    const convertedAmount = homeAmount(e, currency);
    return sum + convertedAmount;
  }, 0);
  const savings = totalIncome - totalSpending;

  // Budget bar: the limit is monthly, so it only makes sense on the month view
  // and for expenses. For the month in progress we also pass how far through it
  // we are, so the bar can say whether spending is ahead of pace; past months
  // just show the final result.
  //
  // It renders *below* the Expenses/Income toggle: hiding it on the income view
  // then only moves the categories underneath, and the toggle the user just
  // tapped stays exactly where their thumb left it.
  const budgetView = (() => {
    if (timePeriodType !== 'month' || transactionType !== 'expense') return null;
    const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    const isFuture =
      selectedYear > now.getFullYear() ||
      (selectedYear === now.getFullYear() && selectedMonth > now.getMonth());
    if (isFuture) return null;
    if (!monthlyBudget || monthlyBudget <= 0) {
      // No budget yet: offer to set one, but only on the month the user is
      // actually living in - nudging from inside last March makes no sense.
      return isCurrentMonth ? { nudge: true as const } : null;
    }
    if (!isCurrentMonth) return { nudge: false as const, daysLeft: null, monthProgress: null };
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const today = now.getDate();
    return {
      nudge: false as const,
      daysLeft: daysInMonth - today,
      monthProgress: today / daysInMonth,
    };
  })();

  // Filter by transaction type for category display
  const filteredTransactions = transactionType === 'expense' 
    ? periodExpenses 
    : transactionType === 'income'
    ? periodIncome
    : currentMonthExpenses;
  const filteredTotal = filteredTransactions.reduce((sum, e) => {
    const convertedAmount = homeAmount(e, currency);
    return sum + convertedAmount;
  }, 0);

  // Get appropriate category list based on transaction type
  const activeCategoryList = transactionType === 'expense' ? categories : incomeCategories;

  // Group expenses by category for current month
  const categoryTotals = filteredTransactions.reduce((acc, expense) => {
    const categoryName = expense.category.name;
    const convertedAmount = homeAmount(expense, currency);
    acc[categoryName] = (acc[categoryName] || 0) + convertedAmount;
    return acc;
  }, {} as Record<string, number>);

  // Sort all categories
  const sortedCategories = Object.entries(categoryTotals)
    .map(([name, amount]) => ({
      name,
      amount,
      category: activeCategoryList.find(c => c.name === name)!,
      percentage: filteredTotal > 0 ? (amount / filteredTotal) * 100 : 0
    }))
    .filter(item => item.category) // Filter out undefined categories
    .sort((a, b) => {
      if (categorySortBy === 'amount') {
        return b.amount - a.amount;
      } else {
        return a.name.localeCompare(b.name);
      }
    });

  // How to render the amounts in the category list.
  //
  // Same idea as the hero card - prefer the full number, abbreviate when it is
  // too long - but decided once for the whole list rather than per row. These
  // amounts share a column with the category names, so a long one (13,964,536
  // Rp) does not clip, it just pushes "Food & Drinks" onto two lines. And in a
  // list, "266,969 Rp" sitting next to "30MM Rp" reads worse than abbreviating
  // every row alike, so the longest entry decides for all of them.
  //
  // Length rather than pixels: the choice is coarse (two options), every row
  // shares one answer, and character count is stable across the layout changes
  // a measured version would have to chase.
  const abbreviateRowAmounts =
    sortedCategories.reduce(
      (longest, item) => Math.max(longest, formatAmountListView(item.amount, currency, 0).length),
      0,
    ) > 11;
  const formatRowAmount = (amount: number) =>
    abbreviateRowAmounts
      ? formatAbbreviatedAmount(amount, currency)
      : formatAmountListView(amount, currency, 0);

  // Get subcategory totals for a specific category
  const getSubcategoryTotals = (categoryName: string) => {
    const categoryExpenses = filteredTransactions.filter(e => e.category.name === categoryName);
    const subcategoryTotals: Record<string, number> = {};
    
    categoryExpenses.forEach(expense => {
      if (expense.subcategory) {
        const convertedAmount = homeAmount(expense, currency);
        subcategoryTotals[expense.subcategory] = (subcategoryTotals[expense.subcategory] || 0) + convertedAmount;
      }
    });
    
    return Object.entries(subcategoryTotals)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: filteredTotal > 0 ? (amount / filteredTotal) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  };

  // The "Other" bucket: transactions in a category that have no subcategory.
  // These are invisible in the subcategory breakdown, so we surface them as a
  // dedicated row (and count all category transactions for the "View all" row).
  const getCategoryExtras = (categoryName: string) => {
    const all = filteredTransactions.filter(e => e.category.name === categoryName);
    const generic = all.filter(e => !e.subcategory);
    const amount = generic.reduce(
      (sum, e) => sum + homeAmount(e, currency),
      0
    );
    return {
      totalCount: all.length,
      otherCount: generic.length,
      otherAmount: amount,
      otherPercentage: filteredTotal > 0 ? (amount / filteredTotal) * 100 : 0,
    };
  };

  // Calculate trend for categories and subcategories
  const calculateTrend = (categoryName: string, subcategoryName?: string): 'up' | 'down' | 'neutral' => {
    const previousPeriodExpenses = getPreviousPeriodExpenses();
    const previousFilteredTransactions = transactionType === 'expense' 
      ? previousPeriodExpenses.filter(e => e.type !== 'income')
      : transactionType === 'income'
      ? previousPeriodExpenses.filter(e => e.type === 'income')
      : previousPeriodExpenses;

    // Get current amount
    let currentAmount = 0;
    if (subcategoryName) {
      // Subcategory trend
      currentAmount = filteredTransactions
        .filter(e => e.category.name === categoryName && e.subcategory === subcategoryName)
        .reduce((sum, e) => {
          const convertedAmount = homeAmount(e, currency);
          return sum + convertedAmount;
        }, 0);
    } else {
      // Category trend
      currentAmount = filteredTransactions
        .filter(e => e.category.name === categoryName)
        .reduce((sum, e) => {
          const convertedAmount = homeAmount(e, currency);
          return sum + convertedAmount;
        }, 0);
    }

    // Get previous amount
    let previousAmount = 0;
    if (subcategoryName) {
      // Subcategory trend
      previousAmount = previousFilteredTransactions
        .filter(e => e.category.name === categoryName && e.subcategory === subcategoryName)
        .reduce((sum, e) => {
          const convertedAmount = homeAmount(e, currency);
          return sum + convertedAmount;
        }, 0);
    } else {
      // Category trend
      previousAmount = previousFilteredTransactions
        .filter(e => e.category.name === categoryName)
        .reduce((sum, e) => {
          const convertedAmount = homeAmount(e, currency);
          return sum + convertedAmount;
        }, 0);
    }

    // If no previous data, it's a new category/subcategory
    if (previousAmount === 0) {
      return 'neutral';
    }

    // Calculate percentage change (5% threshold to avoid showing trend for tiny changes)
    const percentageChange = ((currentAmount - previousAmount) / previousAmount) * 100;
    
    if (Math.abs(percentageChange) < 5) {
      return 'neutral';
    }
    
    return currentAmount > previousAmount ? 'up' : 'down';
  };

  // Get trend data for overall spending, category, or subcategory (Year-to-Date)
  const getTrendData = (identifier: string, txnType: TransactionType) => {
    const trend = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    
    // For savings, we need to calculate income - expenses for each month
    if (txnType === 'savings') {
      // Find earliest transaction date from all expenses
      let startMonth = currentMonth;
      let startYear = currentYear;
      
      if (expenses.length > 0) {
        const earliestDate = expenses.reduce((earliest, expense) => {
          const expenseDate = parseLocalDate(expense.date);
          return expenseDate < earliest ? expenseDate : earliest;
        }, parseLocalDate(expenses[0].date));
        
        startMonth = earliestDate.getMonth();
        startYear = earliestDate.getFullYear();
      } else {
        return [];
      }
      
      // Loop from earliest month to current month
      let loopYear = startYear;
      let loopMonth = startMonth;
      
      while (loopYear < currentYear || (loopYear === currentYear && loopMonth <= currentMonth)) {
        const monthStart = new Date(loopYear, loopMonth, 1);
        const monthEnd = new Date(loopYear, loopMonth + 1, 0, 23, 59, 59, 999);
        
        const monthExpenses = expenses.filter(expense => {
          const expenseDate = parseLocalDate(expense.date);
          return expenseDate >= monthStart && expenseDate <= monthEnd;
        });
        
        const monthIncome = monthExpenses.filter(e => e.type === 'income').reduce((sum, e) => {
          const convertedAmount = homeAmount(e, currency);
          return sum + convertedAmount;
        }, 0);
        const monthSpending = monthExpenses.filter(e => e.type !== 'income').reduce((sum, e) => {
          const convertedAmount = homeAmount(e, currency);
          return sum + convertedAmount;
        }, 0);
        const savingsAmount = monthIncome - monthSpending;
        
        trend.push({
          month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          year: monthStart.getFullYear(),
          amount: savingsAmount,
          total: savingsAmount,
          percentage: 100,
          count: monthExpenses.length
        });
        
        // Move to next month
        loopMonth++;
        if (loopMonth > 11) {
          loopMonth = 0;
          loopYear++;
        }
      }
      
      return trend;
    }
    
    // Filter expenses by transaction type first
    const typeFilteredExpenses = txnType === 'expense' 
      ? expenses.filter(e => e.type !== 'income')
      : txnType === 'income'
      ? expenses.filter(e => e.type === 'income')
      : expenses;
    
    // Determine which expenses to consider for timeline start
    let relevantExpenses = typeFilteredExpenses;
    
    if (identifier !== 'overall') {
      const parts = identifier.split(':');
      const isSubcategory = parts.length === 2;
      const categoryName = parts[0];
      const subcategoryName = isSubcategory ? parts[1] : null;
      
      if (isSubcategory && subcategoryName) {
        relevantExpenses = typeFilteredExpenses.filter(e => e.category.name === categoryName && e.subcategory === subcategoryName);
      } else {
        relevantExpenses = typeFilteredExpenses.filter(e => e.category.name === categoryName);
      }
    }
    
    // Find the earliest expense date from relevant expenses
    let startMonth = currentMonth;
    let startYear = currentYear;
    
    if (relevantExpenses.length > 0) {
      const earliestDate = relevantExpenses.reduce((earliest, expense) => {
        const expenseDate = parseLocalDate(expense.date);
        return expenseDate < earliest ? expenseDate : earliest;
      }, parseLocalDate(relevantExpenses[0].date));
      
      startMonth = earliestDate.getMonth();
      startYear = earliestDate.getFullYear();
    } else {
      // No relevant expenses - return empty array
      return [];
    }
    
    // Loop from earliest expense month to current month
    let loopYear = startYear;
    let loopMonth = startMonth;
    
    while (loopYear < currentYear || (loopYear === currentYear && loopMonth <= currentMonth)) {
      const monthStart = new Date(loopYear, loopMonth, 1);
      const monthEnd = new Date(loopYear, loopMonth + 1, 0, 23, 59, 59, 999);
      
      const monthExpenses = typeFilteredExpenses.filter(expense => {
        const expenseDate = parseLocalDate(expense.date);
        return expenseDate >= monthStart && expenseDate <= monthEnd;
      });
      
      const monthTotal = monthExpenses.reduce((sum, e) => {
        const convertedAmount = homeAmount(e, currency);
        return sum + convertedAmount;
      }, 0);
      
      let amount = 0;
      let filteredCount = 0; // Count based on the selected filter
      
      if (identifier === 'overall') {
        amount = monthTotal;
        filteredCount = monthExpenses.length;
      } else {
        const parts = identifier.split(':');
        const isSubcategory = parts.length === 2;
        const categoryName = parts[0];
        const subcategoryName = isSubcategory ? parts[1] : null;
        
        if (isSubcategory && subcategoryName) {
          const filtered = monthExpenses.filter(e => e.category.name === categoryName && e.subcategory === subcategoryName);
          amount = filtered.reduce((sum, e) => {
            const convertedAmount = homeAmount(e, currency);
            return sum + convertedAmount;
          }, 0);
          filteredCount = filtered.length;
        } else {
          const filtered = monthExpenses.filter(e => e.category.name === categoryName);
          amount = filtered.reduce((sum, e) => {
            const convertedAmount = homeAmount(e, currency);
            return sum + convertedAmount;
          }, 0);
          filteredCount = filtered.length;
        }
      }
      
      trend.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
        year: monthStart.getFullYear(),
        amount,
        total: monthTotal,
        percentage: monthTotal > 0 ? (amount / monthTotal) * 100 : 0,
        count: filteredCount // Now uses filtered count instead of all expenses
      });
      
      // Move to next month
      loopMonth++;
      if (loopMonth > 11) {
        loopMonth = 0;
        loopYear++;
      }
    }
    
    return trend;
  };

  // Get cumulative spending data for the current period
  const getCumulativeData = () => {
    if (transactionType !== 'expense') return [];
    
    const periodStart = (() => {
      switch (timePeriodType) {
        case 'month':
          return new Date(selectedYear, selectedMonth, 1);
        case 'quarter':
          return new Date(selectedYear, selectedQuarter * 3, 1);
        case 'year':
          return new Date(selectedYear, 0, 1);
      }
    })();
    
    const periodEnd = (() => {
      switch (timePeriodType) {
        case 'month':
          return new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
        case 'quarter':
          return new Date(selectedYear, selectedQuarter * 3 + 3, 0, 23, 59, 59, 999);
        case 'year':
          return new Date(selectedYear, 11, 31, 23, 59, 59, 999);
      }
    })();
    
    // Filter expenses for the period
    const periodFilteredExpenses = periodExpenses.filter(expense => {
      const expenseDate = parseLocalDate(expense.date);
      return expenseDate >= periodStart && expenseDate <= periodEnd;
    });
    
    // Generate data points based on granularity
    const data: Array<{ label: string; cumulative: number | null }> = [];
    const now = new Date();
    
    if (timePeriodType === 'month') {
      // Daily granularity
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStart = new Date(selectedYear, selectedMonth, day, 0, 0, 0, 0);
        const dayEnd = new Date(selectedYear, selectedMonth, day, 23, 59, 59, 999);
        
        // Only calculate cumulative for past/current days
        const isFutureDay = isCurrentMonth && day > now.getDate();
        const cumulativeAmount = isFutureDay ? null : periodFilteredExpenses
          .filter(e => {
            const expenseDate = parseLocalDate(e.date);
            return expenseDate >= periodStart && expenseDate <= dayEnd;
          })
          .reduce((sum, e) => sum + homeAmount(e, currency), 0);
        
        data.push({
          label: day.toString(),
          cumulative: cumulativeAmount
        });
      }
    } else if (timePeriodType === 'quarter') {
      // Weekly granularity
      const quarterStartMonth = selectedQuarter * 3;
      const quarterStart = new Date(selectedYear, quarterStartMonth, 1);
      const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0, 23, 59, 59, 999);
      const isCurrentQuarter = selectedYear === now.getFullYear() && selectedQuarter === Math.floor(now.getMonth() / 3);
      
      let currentDate = new Date(quarterStart);
      
      while (currentDate <= quarterEnd) {
        // Calculate week end (6 days from start, capped at quarter end)
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        const actualWeekEnd = weekEnd > quarterEnd ? quarterEnd : weekEnd;
        
        // Calculate actual week number of the year
        const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
        const daysSinceYearStart = Math.floor((currentDate.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((daysSinceYearStart + 1) / 7);
        
        // Only calculate cumulative for weeks that have started
        const isFutureWeek = isCurrentQuarter && currentDate > now;
        const cumulativeAmount = isFutureWeek ? null : periodFilteredExpenses
          .filter(e => {
            const expenseDate = parseLocalDate(e.date);
            return expenseDate >= periodStart && expenseDate <= actualWeekEnd;
          })
          .reduce((sum, e) => sum + homeAmount(e, currency), 0);
        
        data.push({
          label: `W${weekNumber}`,
          cumulative: cumulativeAmount
        });
        
        // Move to next week start
        currentDate.setDate(currentDate.getDate() + 7);
        
        // Safety check: if we've moved past the quarter, break
        if (currentDate > quarterEnd) break;
      }
    } else if (timePeriodType === 'year') {
      // Monthly granularity
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const yearStart = new Date(selectedYear, 0, 1);
      const isCurrentYear = selectedYear === now.getFullYear();
      
      for (let month = 0; month < 12; month++) {
        const monthEnd = new Date(selectedYear, month + 1, 0, 23, 59, 59, 999);
        
        // Only calculate cumulative for months that have started
        const isFutureMonth = isCurrentYear && month > now.getMonth();
        const cumulativeAmount = isFutureMonth ? null : periodFilteredExpenses
          .filter(e => {
            const expenseDate = parseLocalDate(e.date);
            return expenseDate >= yearStart && expenseDate <= monthEnd;
          })
          .reduce((sum, e) => sum + homeAmount(e, currency), 0);
        
        data.push({
          label: monthNames[month],
          cumulative: cumulativeAmount
        });
      }
    }
    
    return data;
  };

  // Get recurrence breakdown data for the donut chart
  const getRecurrenceData = () => {
    const periodStart = (() => {
      switch (timePeriodType) {
        case 'month':
          return new Date(selectedYear, selectedMonth, 1);
        case 'quarter':
          return new Date(selectedYear, selectedQuarter * 3, 1);
        case 'year':
          return new Date(selectedYear, 0, 1);
      }
    })();
    
    const periodEnd = (() => {
      switch (timePeriodType) {
        case 'month':
          return new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
        case 'quarter':
          return new Date(selectedYear, (selectedQuarter + 1) * 3, 0, 23, 59, 59, 999);
        case 'year':
          return new Date(selectedYear, 11, 31, 23, 59, 59, 999);
      }
    })();
    
    // Filter transactions by period and type
    const periodTransactions = expenses.filter(expense => {
      const expenseDate = parseLocalDate(expense.date);
      const typeMatch = transactionType === 'expense' 
        ? expense.type !== 'income'
        : transactionType === 'income'
        ? expense.type === 'income'
        : true; // For savings, include all transactions
      return expenseDate >= periodStart && expenseDate <= periodEnd && typeMatch;
    });
    
    // Calculate totals by recurrence type
    const recurrenceMap: Record<string, number> = {};
    periodTransactions.forEach(transaction => {
      const recurrence = transaction.recurrence || 'Never repeat';
      const convertedAmount = homeAmount(transaction, currency);
      recurrenceMap[recurrence] = (recurrenceMap[recurrence] || 0) + convertedAmount;
    });
    
    // Split into recurrent and one-off
    const oneOff = recurrenceMap['Never repeat'] || 0;
    const recurrentTypes = Object.entries(recurrenceMap).filter(([key]) => key !== 'Never repeat');
    const recurrent = recurrentTypes.reduce((sum, [_, amount]) => sum + amount, 0);
    
    return {
      overview: [
        { name: 'One-off', value: oneOff },
        { name: 'Recurring', value: recurrent }
      ].filter(item => item.value > 0), // Only include items with values
      detail: recurrentTypes.map(([name, value]) => ({ name, value })).filter(item => item.value > 0) // Only include items with values
    };
  };

  // Breakdown of the current period + transaction type by payment source.
  // Slice colours come from each source's brand colour.
  const getSourceBreakdown = () => {
    const periodStart = (() => {
      switch (timePeriodType) {
        case 'month': return new Date(selectedYear, selectedMonth, 1);
        case 'quarter': return new Date(selectedYear, selectedQuarter * 3, 1);
        case 'year': return new Date(selectedYear, 0, 1);
      }
    })();
    const periodEnd = (() => {
      switch (timePeriodType) {
        case 'month': return new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
        case 'quarter': return new Date(selectedYear, (selectedQuarter + 1) * 3, 0, 23, 59, 59, 999);
        case 'year': return new Date(selectedYear, 11, 31, 23, 59, 59, 999);
      }
    })();

    const periodTransactions = expenses.filter((t) => {
      const d = parseLocalDate(t.date);
      const typeMatch =
        transactionType === 'expense' ? t.type !== 'income'
          : transactionType === 'income' ? t.type === 'income'
          : true;
      return typeMatch && d >= periodStart! && d <= periodEnd!;
    });

    const totals: Record<string, number> = {};
    periodTransactions.forEach((t) => {
      const key = t.sourceId || '__none__';
      totals[key] = (totals[key] || 0) + homeAmount(t, currency);
    });

    return Object.entries(totals)
      .map(([id, value]) => {
        const source = sources.find((s) => s.id === id) || null;
        return {
          id,
          name: source?.name || 'No source',
          color: source?.brand || '#C7C7CC',
          source,
          value,
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  const monthName = getPeriodDisplayName();

  // Get personalized greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    if (hour < 23) return 'Good evening';
    return 'Good night';
  };

  const greeting = userName ? `${getGreeting()}, ${userName}` : 'Welcome 👋';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F7' }}>
      {view === 'overview' ? (
        <div className="px-6 pt-1 pb-3">
          {/* Personalized greeting — sits at the very top, visible for 2s on
              each app launch, then collapses */}
          <div
            style={{
              overflow: 'hidden',
              maxHeight: showGreeting ? '22px' : 0,
              opacity: showGreeting ? 1 : 0,
              transition: 'opacity 0.3s ease-out, max-height 0.4s ease-out 0.1s'
            }}
          >
            <p style={{ color: '#8E8E93', fontSize: '14px', marginBottom: '2px' }}>{greeting}</p>
          </div>

          {/* Title row: tab title on the left, period selector on the right */}
          <div className="flex items-center justify-between gap-3">
            <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>
              Dashboard
            </h1>

            {/* Period selector — a native <select> styled like the Activity tab
                filters, with a label and a chevron hint. Kept on the light
                background because the same control flashes black on tap when
                placed on the dark card. */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span style={{ color: '#8E8E93', fontSize: '13px', fontWeight: '500' }}>Period</span>
              <div
                className="relative"
                style={{
                  WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                  isolation: 'isolate',
                  transform: 'translateZ(0)'
                }}
              >
                <select
                  value={timePeriodType}
                  onChange={(e) => {
                    setTimePeriodType(e.target.value as TimePeriodType);
                    const current = getCurrentPeriod();
                    setSelectedMonth(current.month);
                    setSelectedQuarter(current.quarter);
                    setSelectedYear(current.year);
                    setExpandedCategory(null);
                  }}
                  className="pl-2.5 pr-7 py-1 rounded-md text-xs text-neutral-600 border border-neutral-200"
                  style={{
                    WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'manipulation',
                    backgroundColor: '#FAFAFA',
                    // Chevron drawn as the select's own background so it always
                    // paints (an overlay element gets hidden by the native
                    // control's compositing layer)
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238E8E93' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                    transform: 'translateZ(0)',
                    willChange: 'background-color'
                  }}
                >
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="year">Year</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-6 pt-1 pb-3">
          <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>
            Trend
          </h1>
        </div>
      )}

      {/* Current Month View */}
      {viewType === 'current-month' && (
        <>
          {/* Total Spending/Income/Savings Card — premium dark hero */}
          <div className="px-6 mb-4">
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(150deg, #2E2E32 0%, #1C1C1E 100%)',
                boxShadow: '0 12px 30px rgba(28, 28, 30, 0.22)',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <div className="px-6 py-3.5">
                {/* Period navigation — the period-type selector lives above the
                    card on the light background (a native <select> on this dark
                    card flashes black on tap). */}
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={navigatePrevious}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.55)' }}
                    aria-label={`Previous ${timePeriodType}`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="font-semibold text-sm text-center flex-1 min-w-0 truncate" style={{ color: '#FFFFFF' }}>
                    {monthName}
                  </div>

                  <button
                    onClick={navigateNext}
                    disabled={isAtCurrentPeriod()}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-25 flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.55)' }}
                    aria-label={`Next ${timePeriodType}`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* 2×2 metrics — raw flows (Spending / Income) on top, derived
                    results (Savings / Saving Rate) below a hairline divider.
                    Each is set apart by a tinted, colored icon. */}
                <div>
                  {/* Row 1: flows */}
                  <div className="flex">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,105,97,0.16)' }}>
                        <Minus className="w-4 h-4" style={{ color: '#FF6961' }} strokeWidth={3} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] leading-tight mb-1" style={{ color: 'rgba(235,235,245,0.6)' }}>Spending</div>
                        <FitText
                          max={17}
                          min={14}
                          compact={formatAbbreviatedAmount(totalSpending, currency)}
                          className="font-bold leading-none tabular-nums"
                          style={{ color: '#FFFFFF' }}
                        >
                          {formatAmountListView(totalSpending, currency, 0)}
                        </FitText>
                      </div>
                    </div>
                    <div className="w-px self-stretch mx-3" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(48,209,88,0.16)' }}>
                        <Plus className="w-4 h-4" style={{ color: '#30D158' }} strokeWidth={3} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] leading-tight mb-1" style={{ color: 'rgba(235,235,245,0.6)' }}>Income</div>
                        <FitText
                          max={17}
                          min={14}
                          compact={formatAbbreviatedAmount(totalIncome, currency)}
                          className="font-bold leading-none tabular-nums"
                          style={{ color: '#FFFFFF' }}
                        >
                          {formatAmountListView(totalIncome, currency, 0)}
                        </FitText>
                      </div>
                    </div>
                  </div>

                  {/* Divider between flows and results */}
                  <div className="h-px my-3" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />

                  {/* Row 2: results */}
                  <div className="flex">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(100,160,255,0.16)' }}>
                        <Wallet className="w-4 h-4" style={{ color: '#64A0FF' }} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] leading-tight mb-1" style={{ color: 'rgba(235,235,245,0.6)' }}>Savings</div>
                        <FitText
                          max={17}
                          min={14}
                          compact={formatAbbreviatedAmount(savings, currency)}
                          className="font-bold leading-none tabular-nums"
                          style={{ color: savings < 0 ? '#FF6961' : savings > 0 ? '#30D158' : '#FFFFFF' }}
                        >
                          {formatAmountListView(savings, currency, 0)}
                        </FitText>
                      </div>
                    </div>
                    <div className="w-px self-stretch mx-3" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(100,160,255,0.16)' }}>
                        <Percent className="w-4 h-4" style={{ color: '#64A0FF' }} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] leading-tight mb-1" style={{ color: 'rgba(235,235,245,0.6)' }}>Saving Rate</div>
                        <FitText
                          max={17}
                          min={11}
                          className="font-bold leading-none tabular-nums"
                          style={{ color: savings < 0 ? '#FF6961' : savings > 0 ? '#30D158' : '#FFFFFF' }}
                        >
                          {totalIncome > 0 ? `${Math.round((savings / totalIncome) * 100)}%` : '-'}
                        </FitText>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Type Selector */}
          <div className="px-6 mb-4">
            <div 
              className="flex gap-0 rounded-lg overflow-hidden"
              style={{ 
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E5EA'
              }}
            >
              <button
                onClick={() => setTransactionType('expense')}
                className="flex-1 px-4 py-1.5 transition-all text-sm font-medium"
                style={{
                  backgroundColor: transactionType === 'expense' ? '#FFE8E6' : 'transparent',
                  color: transactionType === 'expense' ? '#D32F2F' : '#8E8E93',
                  borderRight: '1px solid #E5E5EA'
                }}
              >
                Expenses
              </button>
              <button
                onClick={() => setTransactionType('income')}
                className="flex-1 px-4 py-1.5 transition-all text-sm font-medium"
                style={{
                  backgroundColor: transactionType === 'income' ? '#E8F5E9' : 'transparent',
                  color: transactionType === 'income' ? '#2E7D32' : '#8E8E93'
                }}
              >
                Income
              </button>
            </div>
          </div>

          {budgetView?.nudge === false && (
            <BudgetBar
              spent={totalSpending}
              budget={monthlyBudget!}
              currency={currency}
              daysLeft={budgetView.daysLeft}
              monthProgress={budgetView.monthProgress}
            />
          )}
          {budgetView?.nudge === true && !budgetNudgeDismissed && (
            <BudgetNudge
              currency={currency}
              onSave={(value) => onSetMonthlyBudget?.(value)}
              onDismiss={() => onDismissBudgetNudge?.()}
            />
          )}

          {/* Expense Type Table Card */}
          <div className="px-6 mb-4">
            <div className="rounded-2xl overflow-hidden" style={{ 
              backgroundColor: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
            }}>
              <div className="px-4 py-4">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 style={{ color: '#1C1C1E', fontWeight: '600' }}>Categories</h2>
                  <button
                    onClick={() => setCategorySortBy(categorySortBy === 'alphabetical' ? 'amount' : 'alphabetical')}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ backgroundColor: '#F2F2F7' }}
                    aria-label="Toggle sort order"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />
                    <span className="text-xs" style={{ color: '#8E8E93' }}>
                      {categorySortBy === 'alphabetical' ? 'A-Z' : '€'}
                    </span>
                  </button>
                </div>
                {sortedCategories.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-neutral-400 text-sm mb-1">
                      No {transactionType === 'expense' ? 'expenses' : 'income'} yet
                    </div>
                    <p className="text-neutral-500 text-xs">
                      Start adding {transactionType === 'expense' ? 'expenses' : 'income'} to see your breakdown
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {sortedCategories.map((item, idx) => {
                      const isExpanded = expandedCategory === item.name;
                      const subcategories = getSubcategoryTotals(item.name);
                      const extras = getCategoryExtras(item.name);
                      const trend = calculateTrend(item.name);

                      return (
                        <div key={`${item.name}-${idx}`}>
                          {/* Main Category Row */}
                          <button
                            onClick={() => {
                              if (subcategories.length > 0) {
                                setExpandedCategory(isExpanded ? null : item.name);
                              } else {
                                setDrilldownContext({ categoryName: item.name, subcategoryName: null });
                              }
                            }}
                            className={`w-full flex items-center justify-between gap-3 py-1.5 rounded-lg transition-colors active:bg-neutral-100`}
                          >
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              {subcategories.length > 0 ? (
                                <ChevronRight
                                  className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform ${
                                    isExpanded ? 'rotate-90' : ''
                                  }`}
                                />
                              ) : (
                                <div className="w-4 h-4 flex-shrink-0" />
                              )}
                              <div className={`w-8 h-8 ${item.category.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                {(() => {
                                  const Icon = getCategoryIcon(item.category.icon);
                                  return <Icon className={`w-4 h-4 ${item.category.color}`} strokeWidth={2} />;
                                })()}
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <div className="text-neutral-900 font-medium text-[13px] mb-1 leading-tight">{item.name}</div>
                                {!isExpanded && (
                                  <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0, 0, 0, 0.08)' }}>
                                    <div 
                                      className={`h-full ${item.category.bgColor}`}
                                      style={{ width: `${item.percentage}%`, opacity: 1 }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                              <div className="text-neutral-400 text-[11px] tabular-nums text-right w-8">{item.percentage.toFixed(0)}%</div>
                              <div className="text-neutral-900 font-semibold text-[14px] tabular-nums text-right whitespace-nowrap min-w-[60px]">
                                {formatRowAmount(item.amount)}
                              </div>
                              {/* Trend Indicator */}
                              <div className="w-3.5 flex items-center justify-center ml-1.5">
                                {trend === 'up' && (
                                  <TrendingUp className="w-3.5 h-3.5" style={{ color: transactionType === 'expense' ? '#FF3B30' : '#34C759', strokeWidth: 2.5 }} />
                                )}
                                {trend === 'down' && (
                                  <TrendingDown className="w-3.5 h-3.5" style={{ color: transactionType === 'expense' ? '#34C759' : '#FF3B30', strokeWidth: 2.5 }} />
                                )}
                                {trend === 'neutral' && (
                                  <Minus className="w-3.5 h-3.5" style={{ color: '#8E8E93', strokeWidth: 2.5 }} />
                                )}
                              </div>
                            </div>
                          </button>
                          
                          {/* Subcategories */}
                          {isExpanded && subcategories.length > 0 && (
                            <div className="ml-11 mt-0.5 mb-1 space-y-0.5 border-l-2 border-neutral-100 pl-3">
                              {subcategories.map((sub, subIdx) => {
                                const subTrend = calculateTrend(item.name, sub.name);
                                return (
                                  <button
                                    key={`${sub.name}-${subIdx}`}
                                    onClick={() => setDrilldownContext({ categoryName: item.name, subcategoryName: sub.name })}
                                    className="flex items-center justify-between gap-3 py-1 w-full text-left active:bg-neutral-100 rounded-md px-1 transition-colors"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-neutral-500 text-xs truncate">{sub.name}</div>
                                      <div className="h-0.5 bg-neutral-100 rounded-full overflow-hidden mt-1">
                                        <div 
                                          className={`h-full ${item.category.bgColor.replace('bg-', 'bg-opacity-50 bg-')}`}
                                          style={{ width: `${sub.percentage}%` }}
                                        />
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                                      <div className="text-neutral-400 text-[10px] tabular-nums text-right w-8">{sub.percentage.toFixed(0)}%</div>
                                      <div className="text-neutral-600 font-normal text-xs tabular-nums text-right whitespace-nowrap min-w-[60px]">
                                        {formatRowAmount(sub.amount)}
                                      </div>
                                      {/* Trend Indicator */}
                                      <div className="w-3.5 flex items-center justify-center ml-1.5">
                                        {subTrend === 'up' && (
                                          <TrendingUp className="w-3 h-3" style={{ color: transactionType === 'expense' ? '#FF3B30' : '#34C759', strokeWidth: 2.5 }} />
                                        )}
                                        {subTrend === 'down' && (
                                          <TrendingDown className="w-3 h-3" style={{ color: transactionType === 'expense' ? '#34C759' : '#FF3B30', strokeWidth: 2.5 }} />
                                        )}
                                        {subTrend === 'neutral' && (
                                          <Minus className="w-3 h-3" style={{ color: '#8E8E93', strokeWidth: 2.5 }} />
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}

                              {/* "Other": transactions in this category with no
                                  subcategory — otherwise unreachable from here */}
                              {extras.otherCount > 0 && (
                                <button
                                  onClick={() => setDrilldownContext({ categoryName: item.name, subcategoryName: UNCATEGORIZED })}
                                  className="flex items-center justify-between gap-3 py-1 w-full text-left active:bg-neutral-100 rounded-md px-1 transition-colors"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-neutral-400 text-xs truncate italic">Other</div>
                                    <div className="h-0.5 bg-neutral-100 rounded-full overflow-hidden mt-1">
                                      <div
                                        className={`h-full ${item.category.bgColor.replace('bg-', 'bg-opacity-30 bg-')}`}
                                        style={{ width: `${Math.max(0, extras.otherPercentage)}%` }}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                                    <div className="text-neutral-400 text-[10px] tabular-nums text-right w-8">{extras.otherPercentage.toFixed(0)}%</div>
                                    <div className="text-neutral-600 font-normal text-xs tabular-nums text-right whitespace-nowrap min-w-[60px]">
                                      {formatAmountListView(extras.otherAmount, currency, 0)}
                                    </div>
                                    <div className="w-3.5 ml-1.5" />
                                  </div>
                                </button>
                              )}

                              {/* See every transaction in the category at once */}
                              <button
                                onClick={() => setDrilldownContext({ categoryName: item.name, subcategoryName: null })}
                                className="flex items-center gap-1 py-1.5 w-full text-left active:bg-neutral-100 rounded-md px-1 transition-colors"
                              >
                                <span className="text-[11px] font-medium" style={{ color: '#007AFF' }}>
                                  View all {extras.totalCount} transactions
                                </span>
                                <ChevronRight className="w-3.5 h-3.5" style={{ color: '#007AFF' }} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cumulative Spending Chart - Only for Expenses */}
          {transactionType === 'expense' && (() => {
            const cumulativeData = getCumulativeData();
            if (cumulativeData.length === 0) return null;
            // Hide the chart entirely when the period has no spending yet
            if (!cumulativeData.some(d => (d.cumulative ?? 0) > 0)) return null;
            
            const maxValue = Math.max(...cumulativeData.map(d => d.cumulative));

            // Calculate dynamic interval to prevent label overlap
            // Target: show ~6-8 labels max on mobile
            const calculateInterval = () => {
              const dataLength = cumulativeData.length;
              if (timePeriodType === 'month') {
                // For 28-31 days, show every 4-5 days
                return Math.ceil(dataLength / 6);
              } else if (timePeriodType === 'quarter') {
                // For ~13 weeks, show every 2 weeks
                return Math.max(1, Math.floor(dataLength / 6));
              } else {
                // For 12 months, show every month
                return 0;
              }
            };
            
            // Manual touch handler for better mobile sensitivity
            const handleManualTouch = (e: React.TouchEvent<HTMLDivElement>) => {
              const touch = e.touches[0];
              if (!touch) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const touchX = touch.clientX - rect.left;
              
              // Recharts margins: { top: 5, right: 10, left: -8, bottom: 5 }
              // YAxis width is 40px
              const yAxisWidth = 40;
              const chartLeftMargin = 0; // plot starts at yAxisWidth (labels sit to its left)
              const chartRightMargin = 10;
              const chartTopMargin = 5;
              const chartBottomMargin = 5;
              const leftOffset = yAxisWidth + chartLeftMargin;
              const plotWidth = rect.width - leftOffset - chartRightMargin;
              const relativeX = touchX - leftOffset;
              
              if (relativeX < 0 || relativeX > plotWidth) {
                return; // Don't clear tooltip, just ignore out-of-bounds touches
              }
              
              // Find closest data point
              const dataIndex = Math.round((relativeX / plotWidth) * (cumulativeData.length - 1));
              const clampedIndex = Math.max(0, Math.min(dataIndex, cumulativeData.length - 1));
              const dataPoint = cumulativeData[clampedIndex];
              
              if (!dataPoint || dataPoint.cumulative === null) return; // future days have no value
              
              const dataValue = dataPoint.cumulative;
              
              // Calculate positions to match Recharts' rendering exactly
              const chartHeight = 200;
              // XAxis takes space for labels: fontSize(11px) + tick(5px) + padding(~14px) = ~30px
              const xAxisHeight = 30;
              const plotHeight = chartHeight - chartTopMargin - chartBottomMargin - xAxisHeight;
              
              // Use the actual max from the data (same as Recharts 'dataMax')
              const actualMax = niceAxis(Math.max(...cumulativeData.map(d => d.cumulative ?? 0), 1)).max;
              
              // Ensure we don't divide by zero
              if (actualMax === 0) return;
              
              const valueRatio = dataValue / actualMax;
              const yPosition = chartTopMargin + plotHeight * (1 - valueRatio);
              const xPosition = leftOffset + (plotWidth / (cumulativeData.length - 1)) * clampedIndex;
              
              // Format label
              let periodLabel = dataPoint.label;
              if (timePeriodType === 'month') {
                const day = parseInt(dataPoint.label);
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const monthName = monthNames[selectedMonth];
                const date = new Date(selectedYear, selectedMonth, day);
                const dayOfWeek = dayNames[date.getDay()];
                const getOrdinal = (n: number) => {
                  const s = ["th", "st", "nd", "rd"];
                  const v = n % 100;
                  return n + (s[(v - 20) % 10] || s[v] || s[0]);
                };
                periodLabel = `${dayOfWeek}, ${monthName} ${getOrdinal(day)}`;
              } else if (timePeriodType === 'year') {
                // The x-axis shows just the month initial when zoomed to a year;
                // spell it out fully in the tooltip where there's room.
                periodLabel = new Date(selectedYear, clampedIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              }

              setTooltipData({
                x: xPosition,
                y: yPosition,
                label: periodLabel,
                value: dataValue
              });
            };
            
            // Manual mouse handler (same logic as touch)
            const handleManualMouse = (e: React.MouseEvent<HTMLDivElement>) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              
              const yAxisWidth = 40;
              const chartLeftMargin = 0; // plot starts at yAxisWidth (labels sit to its left)
              const chartRightMargin = 10;
              const chartTopMargin = 5;
              const chartBottomMargin = 5;
              const leftOffset = yAxisWidth + chartLeftMargin;
              const plotWidth = rect.width - leftOffset - chartRightMargin;
              const relativeX = mouseX - leftOffset;
              
              if (relativeX < 0 || relativeX > plotWidth) {
                return;
              }
              
              const dataIndex = Math.round((relativeX / plotWidth) * (cumulativeData.length - 1));
              const clampedIndex = Math.max(0, Math.min(dataIndex, cumulativeData.length - 1));
              const dataPoint = cumulativeData[clampedIndex];
              
              if (!dataPoint || dataPoint.cumulative === null) return; // future days have no value
              
              const dataValue = dataPoint.cumulative;
              const chartHeight = 200;
              const xAxisHeight = 30;
              const plotHeight = chartHeight - chartTopMargin - chartBottomMargin - xAxisHeight;
              const actualMax = niceAxis(Math.max(...cumulativeData.map(d => d.cumulative ?? 0), 1)).max;
              
              if (actualMax === 0) return;
              
              const valueRatio = dataValue / actualMax;
              const yPosition = chartTopMargin + plotHeight * (1 - valueRatio);
              const xPosition = leftOffset + (plotWidth / (cumulativeData.length - 1)) * clampedIndex;
              
              let periodLabel = dataPoint.label;
              if (timePeriodType === 'month') {
                const day = parseInt(dataPoint.label);
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const monthName = monthNames[selectedMonth];
                const date = new Date(selectedYear, selectedMonth, day);
                const dayOfWeek = dayNames[date.getDay()];
                const getOrdinal = (n: number) => {
                  const s = ["th", "st", "nd", "rd"];
                  const v = n % 100;
                  return n + (s[(v - 20) % 10] || s[v] || s[0]);
                };
                periodLabel = `${dayOfWeek}, ${monthName} ${getOrdinal(day)}`;
              } else if (timePeriodType === 'year') {
                // The x-axis shows just the month initial when zoomed to a year;
                // spell it out fully in the tooltip where there's room.
                periodLabel = new Date(selectedYear, clampedIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              }

              setTooltipData({
                x: xPosition,
                y: yPosition,
                label: periodLabel,
                value: dataValue
              });
            };
            
            return (
              <div className="px-6 mb-4">
                <div className="rounded-2xl overflow-hidden" style={{ 
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                }}>
                  <div className="px-6 py-4">
                    <h3 className="text-sm mb-3" style={{ color: '#1C1C1E', fontWeight: '600' }}>
                      Cumulative Spending
                    </h3>
                    <div
                      ref={chartBoxRef}
                      style={{ height: '200px', width: '100%', position: 'relative', minWidth: 0, minHeight: 0 }}
                      onMouseMove={handleManualMouse}
                      onMouseLeave={() => setTooltipData(null)}
                    >
                      {/* Custom SVG area chart — no recharts to avoid internal key collision */}
                      {(() => {
                        // Render at the container's real width so 1 SVG unit = 1px:
                        // this keeps the endpoint dot round and the axis text undistorted.
                        const svgW = chartWidth || 340;
                        const svgH = 200;
                        const marginTop = 5;
                        const marginRight = 10;
                        const marginBottom = 35; // room for x-axis labels
                        const yAxisW = 40;
                        const marginLeft = yAxisW; // plot starts after the y-axis label column so they don't overlap
                        const plotW = svgW - marginLeft - marginRight;
                        const plotH = svgH - marginTop - marginBottom;
                        const n = cumulativeData.length;
                        const dataMax = Math.max(...cumulativeData.map(d => d.cumulative ?? 0), 1);

                        // Round the axis up to a nice max with round steps, leaving a little headroom
                        const { max: axisMax, step: yStep } = niceAxis(dataMax);
                        const yTicks: Array<{ value: number }> = [];
                        for (let v = 0; v <= axisMax + 1e-6; v += yStep) yTicks.push({ value: v });

                        const xOf = (i: number) => marginLeft + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
                        const yOf = (v: number) => marginTop + plotH * (1 - v / axisMax);

                        // X-axis ticks at a regular interval; replace the last one with the true
                        // final day when they'd otherwise collide, so labels never crowd
                        const interval = calculateInterval();
                        const xTicks = cumulativeData.filter((_, i) =>
                          interval === 0 ? true : i % (interval + 1) === 0
                        );
                        if (interval !== 0 && n > 1) {
                          const lastDay = cumulativeData[n - 1];
                          const prevIdx = cumulativeData.indexOf(xTicks[xTicks.length - 1]);
                          if (prevIdx !== n - 1) {
                            if (n - 1 - prevIdx >= (interval + 1) / 2) xTicks.push(lastDay);
                            else xTicks[xTicks.length - 1] = lastDay;
                          }
                        }

                        // Area path — skip future days (cumulative === null) so the line stops at today
                        const linePts = cumulativeData
                          .map((d, i) => ({ cumulative: d.cumulative, i }))
                          .filter((d): d is { cumulative: number; i: number } => d.cumulative !== null)
                          .map(d => ({ x: xOf(d.i), y: yOf(d.cumulative) }));
                        const lineD = linePts.reduce((acc, p, i) => {
                          if (i === 0) return `M ${p.x},${p.y}`;
                          const prev = linePts[i - 1];
                          const cp1x = prev.x + (p.x - prev.x) / 3;
                          const cp2x = prev.x + (p.x - prev.x) * 2 / 3;
                          return `${acc} C ${cp1x},${prev.y} ${cp2x},${p.y} ${p.x},${p.y}`;
                        }, '');
                        const areaD = linePts.length > 1
                          ? `${lineD} L ${linePts[linePts.length - 1].x},${marginTop + plotH} L ${linePts[0].x},${marginTop + plotH} Z`
                          : '';

                        return (
                          <svg
                            width="100%"
                            height="100%"
                            viewBox={`0 0 ${svgW} ${svgH}`}
                            preserveAspectRatio="xMidYMid meet"
                            style={{ display: 'block' }}
                          >
                            <defs>
                              <linearGradient id="customCumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.20} />
                                <stop offset="70%" stopColor="#3B82F6" stopOpacity={0.05} />
                                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="customCumulativeLine" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#60A5FA" />
                                <stop offset="100%" stopColor="#2563EB" />
                              </linearGradient>
                            </defs>

                            {/* Horizontal grid lines */}
                            {yTicks.map((t, i) => (
                              <line
                                key={`grid-${i}`}
                                x1={marginLeft} y1={yOf(t.value)}
                                x2={svgW - marginRight} y2={yOf(t.value)}
                                stroke="#F2F2F7" strokeWidth={1} strokeDasharray="3 3"
                              />
                            ))}

                            {/* X-axis baseline */}
                            <line
                              x1={marginLeft} y1={marginTop + plotH}
                              x2={svgW - marginRight} y2={marginTop + plotH}
                              stroke="#E5E5EA" strokeWidth={1}
                            />

                            {/* Area fill */}
                            {areaD && <path d={areaD} fill="url(#customCumulativeGrad)" />}

                            {/* Area stroke */}
                            {linePts.length > 1 && <path d={lineD} fill="none" stroke="url(#customCumulativeLine)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}

                            {/* "Today" endpoint marker so the line reads as current, not cut off */}
                            {linePts.length > 0 && (() => {
                              const last = linePts[linePts.length - 1];
                              return (
                                <>
                                  <circle cx={last.x} cy={last.y} r={7} fill="#2563EB" opacity={0.12} />
                                  <circle cx={last.x} cy={last.y} r={3.5} fill="#2563EB" stroke="#FFFFFF" strokeWidth={2} />
                                </>
                              );
                            })()}

                            {/* Y-axis labels — right-aligned a few px before the plot's left edge */}
                            {yTicks.map((t, i) => (
                              <text
                                key={`ylabel-${i}`}
                                x={marginLeft - 8}
                                y={yOf(t.value) + 4}
                                textAnchor="end"
                                fontSize={10}
                                fill="#8E8E93"
                              >
                                {formatAxisTick(t.value)}
                              </text>
                            ))}

                            {/* X-axis labels */}
                            {xTicks.map((d, i) => {
                              const origIdx = cumulativeData.indexOf(d);
                              return (
                                <text
                                  key={`xlabel-${i}`}
                                  x={xOf(origIdx)}
                                  y={marginTop + plotH + 16}
                                  textAnchor="middle"
                                  fontSize={11}
                                  fill="#8E8E93"
                                >
                                  {timePeriodType === 'year' ? d.label.charAt(0) : d.label}
                                </text>
                              );
                            })}
                          </svg>
                        );
                      })()}
                      
                      {/* Manual Tooltip - positioned absolutely based on state */}
                      {tooltipData && (() => {
                        const chartHeight = 200;
                        const chartMidpoint = chartHeight / 2;
                        const tooltipHeight = 50;
                        const tooltipWidth = 140;
                        const margin = 8;
                        const dotOffset = 12;
                        
                        const yAxisWidth = 40;
                        const chartLeftMargin = 0; // plot starts at yAxisWidth (labels sit to its left)
                        const chartRightMargin = 10;
                        const chartContainerWidth = 390;
                        const plotWidth = chartContainerWidth - yAxisWidth - chartLeftMargin - chartRightMargin;
                        
                        const showAbove = tooltipData.y > chartMidpoint;
                        
                        let tooltipY = tooltipData.y;
                        if (showAbove) {
                          tooltipY = Math.max(margin + tooltipHeight / 2, tooltipData.y - dotOffset - tooltipHeight / 2);
                        } else {
                          tooltipY = Math.min(chartHeight - margin - tooltipHeight / 2, tooltipData.y + dotOffset + tooltipHeight / 2);
                        }
                        
                        const leftEdge = yAxisWidth + Math.abs(chartLeftMargin);
                        const rightEdge = chartContainerWidth - chartRightMargin;
                        const availableWidth = rightEdge - leftEdge;
                        
                        const relativeX = tooltipData.x - leftEdge;
                        const nearLeftEdge = relativeX < (tooltipWidth / 2 + margin);
                        const nearRightEdge = relativeX > (availableWidth - tooltipWidth / 2 - margin);
                        
                        let transformX = '-50%';
                        if (nearLeftEdge) {
                          transformX = '0%';
                        } else if (nearRightEdge) {
                          transformX = '-100%';
                        }
                        
                        return (
                          <>
                            {/* Vertical indicator line */}
                            <div 
                              style={{
                                position: 'absolute',
                                left: `${tooltipData.x}px`,
                                top: '5px',
                                bottom: '35px',
                                width: '1px',
                                backgroundColor: '#E5E5EA',
                                pointerEvents: 'none',
                                zIndex: 8
                              }}
                            />
                            
                            {/* Dot on the data point */}
                            <div 
                              style={{
                                position: 'absolute',
                                left: `${tooltipData.x}px`,
                                top: `${tooltipData.y}px`,
                                transform: 'translate(-50%, -50%)',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: '#FFFFFF',
                                border: '2px solid #6BA3F5',
                                pointerEvents: 'none',
                                zIndex: 9
                              }}
                            />
                            
                            {/* Tooltip box */}
                            <div 
                              style={{
                                position: 'absolute',
                                left: `${tooltipData.x}px`,
                                top: `${tooltipY}px`,
                                transform: `translate(${transformX}, -50%)`,
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E5E5EA',
                                borderRadius: '8px',
                                padding: '6px 8px',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                                pointerEvents: 'none',
                                zIndex: 10,
                                minWidth: '130px',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <p style={{ color: '#8E8E93', fontSize: '11px', marginTop: 0, marginLeft: 0, marginRight: 0, marginBottom: 0, whiteSpace: 'nowrap' }}>
                                {tooltipData.label}
                              </p>
                              <p style={{ color: '#1C1C1E', fontSize: '13px', fontWeight: '600', marginTop: 0, marginLeft: 0, marginRight: 0, marginBottom: 0, whiteSpace: 'nowrap' }}>
                                {formatAmountListView(tooltipData.value, currency, 0)}
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Recurrence Breakdown Donut Chart */}
          {(() => {
            const recurrenceData = getRecurrenceData();
            const currentData = recurrenceLayer === 'overview' ? recurrenceData.overview : recurrenceData.detail;
            const totalValue = currentData.reduce((sum, item) => sum + item.value, 0);
            
            if (totalValue === 0) return null;
            
            // One indigo family, whatever the transaction type.
            //
            // This split is categorical - neither half is good or bad - so it
            // must not borrow the reds, ambers and greens that mean "over
            // budget" and "on track" elsewhere on this screen. Cool hues also
            // sit apart from the category tiles, which own the warm end.
            //
            // One-off is the paler of the pair: it is usually the bigger share,
            // and the larger area wants the lighter ink.
            const colorScheme = recurrenceLayer === 'overview'
              ? {
                  primary: '#A5A2F6',    // One-off
                  secondary: '#4F46E5',  // Recurring
                  tertiary: '#7C6DF2',
                  quaternary: '#C9C7FA',
                }
              : {
                  // Detail layer: one schedule per colour, stepping down the
                  // same ramp so they read as parts of "Recurring".
                  primary: '#4F46E5',
                  secondary: '#7C6DF2',
                  tertiary: '#A5A2F6',
                  quaternary: '#C9C7FA',
                };
            
            // Assign colors to slices
            const dataWithColors = currentData.map((item, index) => {
              const colors = [colorScheme.primary, colorScheme.secondary, colorScheme.tertiary, colorScheme.quaternary];
              return {
                ...item,
                color: colors[index % colors.length],
                percentage: (item.value / totalValue) * 100
              };
            });
            
            // With a single slice the donut is a plain ring and the legend
            // repeats it at 100% - half a screen to say one thing. State it in a
            // line instead; the card keeps its place so the page does not jump
            // once a second kind of expense appears.
            if (recurrenceLayer === 'overview' && dataWithColors.length === 1) {
              const only = dataWithColors[0];
              return (
                <div className="px-6 mb-4">
                  <div className="rounded-2xl px-6 py-4 bg-white" style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}>
                    <h3 className="text-sm mb-1.5" style={{ color: '#1C1C1E', fontWeight: '600' }}>
                      One-off vs Recurring
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: only.color }}
                        aria-hidden="true"
                      />
                      <span style={{ color: '#8E8E93', fontSize: 13 }}>
                        All {formatAmountListView(only.value, currency, 0)} was{' '}
                        {only.name.toLowerCase()}.
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div className="px-6 mb-4">
                <div className="rounded-2xl overflow-hidden" style={{ 
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                }}>
                  <div className="px-6 py-4">
                    {/* Title and Back button */}
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm" style={{ color: '#1C1C1E', fontWeight: '600' }}>
                        One-off vs Recurring
                      </h3>
                      {recurrenceLayer === 'detail' ? (
                        <button
                          onClick={() => {
                            setRecurrenceLayer('overview');
                            setSelectedRecurrenceSlice(null);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors"
                          style={{ 
                            color: '#8E8E93',
                            fontSize: '12px',
                            backgroundColor: 'transparent'
                          }}
                        >
                          <ChevronLeft size={14} />
                          <span>Back</span>
                        </button>
                      ) : (
                        /* The donut used to carry the total in its hole. */
                        <span className="tabular-nums" style={{ color: '#8E8E93', fontSize: '12px' }}>
                          {formatAmountListView(totalValue, currency, 0)}
                        </span>
                      )}
                    </div>
                    
                    {/* Composition bar. A donut spent ~150px of height on a
                        two-way split and repeated every number in the legend
                        under it; the bar says the same thing in ten pixels and
                        lines up with that legend. Segments stay clickable, so
                        tapping Recurring still opens the breakdown. */}
                    <div
                      className="flex gap-0.5 h-2.5 rounded-full overflow-hidden mb-1"
                      style={{ backgroundColor: '#F2F2F7' }}
                    >
                      {dataWithColors.map((item, index) => {
                        const isSelected = selectedRecurrenceSlice === item.name;
                        return (
                          <button
                            key={`bar-${item.name}-${index}`}
                            aria-label={`${item.name}, ${item.percentage.toFixed(0)}%`}
                            onClick={() => {
                              if (item.name === 'Recurring' && recurrenceLayer === 'overview') {
                                setRecurrenceLayer('detail');
                              } else {
                                setSelectedRecurrenceSlice(isSelected ? null : item.name);
                              }
                            }}
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: item.color,
                              opacity: selectedRecurrenceSlice === null || isSelected ? 1 : 0.35,
                              transition: 'opacity 0.2s',
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Legend */}
                    <div style={{ marginTop: '8px' }}>
                      {dataWithColors.map((item, index) => (
                        <button
                          key={`${item.name}-${index}`}
                          onClick={() => {
                            if (item.name === 'Recurring' && recurrenceLayer === 'overview') {
                              setRecurrenceLayer('detail');
                            } else {
                              const isSelected = selectedRecurrenceSlice === item.name;
                              setSelectedRecurrenceSlice(isSelected ? null : item.name);
                            }
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 0',
                            borderTop: 'none',
                            borderLeft: 'none',
                            borderRight: 'none',
                            borderBottomWidth: index < dataWithColors.length - 1 ? '1px' : '0',
                            borderBottomStyle: 'solid',
                            borderBottomColor: '#F5F5F7',
                            background: 'transparent',
                            cursor: 'pointer',
                            opacity: selectedRecurrenceSlice === null || selectedRecurrenceSlice === item.name ? 1 : 0.5,
                            transition: 'opacity 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '3px',
                                backgroundColor: item.color,
                                flexShrink: 0
                              }}
                            />
                            <span style={{ 
                              color: '#1C1C1E', 
                              fontSize: '13px',
                              fontWeight: '500'
                            }}>
                              {item.name}
                              {item.name === 'Recurring' && recurrenceLayer === 'overview' && (
                                <ChevronRight size={14} style={{ display: 'inline', marginLeft: '4px', verticalAlign: 'middle' }} />
                              )}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ 
                              color: '#8E8E93', 
                              fontSize: '12px'
                            }}>
                              {item.percentage.toFixed(0)}%
                            </span>
                            <span style={{ 
                              color: '#1C1C1E', 
                              fontSize: '13px',
                              fontWeight: '600',
                              minWidth: '70px',
                              textAlign: 'right'
                            }}>
                              {formatAmountListView(item.value, currency, 0)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Source Breakdown Pie Chart — below Recurring vs One-off */}
          {(() => {
            const sourceData = getSourceBreakdown();
            const totalValue = sourceData.reduce((sum, item) => sum + item.value, 0);
            if (totalValue === 0 || sourceData.length === 0) return null;

            const withPct = sourceData.map((item) => ({
              ...item,
              percentage: (item.value / totalValue) * 100,
            }));

            const size = 130;
            const strokeWidth = 28;
            const radius = (size - strokeWidth) / 2;
            const circumference = 2 * Math.PI * radius;
            const centerX = size / 2;
            const centerY = size / 2;

            let cumulativeOffset = 0;
            const segments = withPct.map((item) => {
              const dashArray = (item.percentage / 100) * circumference;
              const seg = { ...item, dashArray, dashOffset: cumulativeOffset };
              cumulativeOffset += dashArray;
              return seg;
            });

            return (
              <div className="px-6 mb-4">
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}>
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm" style={{ color: '#1C1C1E', fontWeight: '600' }}>
                        {transactionType === 'income' ? 'Income by Source' : 'Spending by Source'}
                      </h3>
                    </div>

                    {/* Donut */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '150px' }}>
                      <div style={{ position: 'relative', width: size, height: size }}>
                        <svg width={size} height={size}>
                          {segments.map((segment, index) => (
                            <circle
                              key={`${segment.id}-${index}`}
                              cx={centerX}
                              cy={centerY}
                              r={radius}
                              fill="none"
                              stroke={segment.color}
                              strokeWidth={strokeWidth}
                              strokeDasharray={`${segment.dashArray} ${circumference}`}
                              strokeDashoffset={-segment.dashOffset}
                              style={{
                                transform: 'rotate(-90deg)',
                                transformOrigin: `${centerX}px ${centerY}px`,
                              }}
                              strokeLinecap="butt"
                            />
                          ))}
                        </svg>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                          <p style={{ color: '#8E8E93', fontSize: '10px', margin: 0, marginBottom: '2px' }}>Total</p>
                          <p style={{ color: '#1C1C1E', fontSize: '13px', fontWeight: '600', margin: 0 }}>
                            {formatAmountListView(totalValue, currency, 0)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Legend */}
                    <div style={{ marginTop: '8px' }}>
                      {withPct.map((item, index) => (
                        <div
                          key={`${item.id}-${index}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 0',
                            borderBottomWidth: index < withPct.length - 1 ? '1px' : '0',
                            borderBottomStyle: 'solid',
                            borderBottomColor: '#F5F5F7',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {item.source ? (
                              <SourceLogo source={item.source} size={18} />
                            ) : (
                              <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: item.color }} />
                            )}
                            <span style={{ color: '#1C1C1E', fontSize: '13px', fontWeight: '500' }}>{item.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ color: '#8E8E93', fontSize: '12px' }}>{item.percentage.toFixed(0)}%</span>
                            <span style={{ color: '#1C1C1E', fontSize: '13px', fontWeight: '600', minWidth: '70px', textAlign: 'right' }}>
                              {formatAmountListView(item.value, currency, 0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Trend View */}
      {viewType === 'trend' && (() => {
        // Get trend categories based on transaction type
        const trendCategoryList = transactionType === 'expense' ? categories : incomeCategories;
        
        // Filter transactions for Trend view based on trendYearFilter and transaction type
        const trendFilteredTransactions = expenses.filter(expense => {
          const expenseDate = parseLocalDate(expense.date);
          const yearMatch = expenseDate.getFullYear() === trendYearFilter;
          const typeMatch = transactionType === 'expense' 
            ? expense.type !== 'income'
            : transactionType === 'income'
            ? expense.type === 'income'
            : true;
          return yearMatch && typeMatch;
        });
        
        // Filter trend categories to only show those with data
        const trendCategoryTotals = trendFilteredTransactions.reduce((acc, expense) => {
          const categoryName = expense.category.name;
          acc[categoryName] = (acc[categoryName] || 0) + homeAmount(expense, currency);
          return acc;
        }, {} as Record<string, number>);
        
        const trendSortedCategories = Object.entries(trendCategoryTotals)
          .map(([name, amount]) => ({
            name,
            amount,
            category: trendCategoryList.find(c => c.name === name)!
          }))
          .filter(item => item.category);
        
        // Build identifier based on filter selection
        let identifier = 'overall';
        if (selectedCategory !== 'All') {
          if (selectedSubcategory !== 'All') {
            identifier = `${selectedCategory}:${selectedSubcategory}`;
          } else {
            identifier = selectedCategory;
          }
        }
        
        const trendDataRaw = getTrendData(identifier, transactionType);
        
        // Filter trendData by selected year
        const trendData = trendDataRaw.filter(item => item.year === trendYearFilter);
        
        // Calculate Y-axis range - handle negative values for savings
        const allAmounts = trendData.map(t => t.amount);
        const actualMin = allAmounts.length > 0 ? Math.min(...allAmounts) : 0;
        const actualMax = allAmounts.length > 0 ? Math.max(...allAmounts) : 0;
        
        // Round axis ends to friendly numbers so the labels read as ticks
        // rather than as three of the data's own values.
        const niceStep = (raw: number) => {
          if (!(raw > 0)) return 1;
          const magnitude = 10 ** Math.floor(Math.log10(raw));
          const n = raw / magnitude;
          return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitude;
        };

        let yMin: number;
        let yMax: number;

        if (transactionType === 'savings' || actualMin < 0) {
          // Charts that cross zero stay symmetric around it, so the zero line
          // sits in the middle and a loss reads as the mirror of a gain.
          const bound = Math.max(Math.abs(actualMin), Math.abs(actualMax)) * 1.1;
          const step = niceStep(bound / 2);
          const rounded = bound > 0 ? Math.ceil(bound / step) * step : 1;
          yMax = actualMax > 0 || actualMin >= 0 ? rounded : 0;
          yMin = actualMin < 0 ? -rounded : 0;
        } else {
          // Positive-only charts (expenses/income).
          //
          // The axis used to start just under the smallest month, which let a
          // steady year - say 3,329 to 3,931, an 18% spread - fill the whole
          // chart and read as a dramatic peak and collapse. A zero baseline
          // would be honest but flattens most real data into a straight line,
          // so instead the axis may zoom in only so far: it never starts above
          // half the top of the scale. Volatile data still lands on zero on its
          // own, because the padded minimum falls below that cap.
          const nonZeroAmounts = allAmounts.filter(a => a > 0);
          const minAmount = nonZeroAmounts.length > 0 ? Math.min(...nonZeroAmounts) : 0;
          const maxAmount = nonZeroAmounts.length > 0 ? Math.max(...nonZeroAmounts) : 1;

          const step = niceStep(maxAmount / 4);
          const upper = Math.ceil(maxAmount / step) * step;
          const zoomFloor = upper / 2; // the axis may not start above this
          // Months with nothing in them are still drawn, so the floor has to
          // reach them - otherwise the line dives out through the bottom of the
          // plot, which is what an empty current month used to do.
          const padded = Math.min(actualMin, minAmount - (maxAmount - minAmount) * 0.15);
          yMin = Math.max(0, Math.floor(Math.max(0, Math.min(padded, zoomFloor)) / step) * step);
          yMax = upper;
        }
        
        const yRange = yMax - yMin;
        
        // Calculate average - for savings include negative values
        const monthsWithData = transactionType === 'savings' 
          ? trendData 
          : trendData.filter(t => t.amount > 0);
        const avgAmount = monthsWithData.length > 0 
          ? monthsWithData.reduce((sum, t) => sum + t.amount, 0) / monthsWithData.length
          : 0;
        
        const totalSpent = trendData.reduce((sum, t) => sum + t.amount, 0);
        
        // Find current month and max/min month indices
        const currentMonthIndex = trendData.length - 1;
        const maxAmount = Math.max(...allAmounts);
        const minAmount = Math.min(...allAmounts);
        const maxMonthIndex = trendData.findIndex(t => t.amount === maxAmount && t.amount !== 0);
        const minMonthIndex = trendData.findIndex(t => t.amount === minAmount && t.amount !== 0);
        
        // For "Best" badge logic:
        // - Expenses: Best = minimum (lowest spending)
        // - Income: Best = maximum (highest income)
        // - Savings: Best = maximum (most saved)
        const bestMonthIndex = transactionType === 'expense' ? minMonthIndex : maxMonthIndex;
        
        // For "Worst" badge logic:
        // - Expenses: Worst = maximum (highest spending)
        // - Income: Worst = minimum (lowest income)
        // - Savings: Worst = minimum (least saved/most lost)
        const worstMonthIndex = transactionType === 'expense' ? maxMonthIndex : minMonthIndex;
        
        // For bar chart, find month with maximum absolute value
        const absAmounts = allAmounts.map(a => Math.abs(a));
        const maxAbsAmount = Math.max(...absAmounts);
        const maxAbsMonthIndex = trendData.findIndex(t => Math.abs(t.amount) === maxAbsAmount && t.amount !== 0);
        
        const selectedCat = selectedCategory !== 'All' ? trendSortedCategories.find(c => c.name === selectedCategory) : null;
        
        return (
          <div className="bg-neutral-50">
            {/* Transaction Type Selector */}
            <div className="px-6 pt-2 pb-3 bg-white border-b border-neutral-100">
              <div className="flex items-center gap-3 justify-between">
                <div 
                  className="inline-flex gap-0 rounded-lg overflow-hidden"
                  style={{ 
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E5E5EA'
                  }}
                >
                  <button
                    onClick={() => {
                      setTransactionType('expense');
                      setSelectedCategory('All');
                      setSelectedSubcategory('All');
                    }}
                    className="px-4 py-1.5 transition-all text-sm font-medium"
                    style={{
                      backgroundColor: transactionType === 'expense' ? '#FFE8E6' : 'transparent',
                      color: transactionType === 'expense' ? '#D32F2F' : '#8E8E93',
                      borderRight: '1px solid #E5E5EA'
                    }}
                  >
                    Expenses
                  </button>
                  <button
                    onClick={() => {
                      setTransactionType('income');
                      setSelectedCategory('All');
                      setSelectedSubcategory('All');
                    }}
                    className="px-4 py-1.5 transition-all text-sm font-medium"
                    style={{
                      backgroundColor: transactionType === 'income' ? '#E8F5E9' : 'transparent',
                      color: transactionType === 'income' ? '#2E7D32' : '#8E8E93',
                      borderRight: '1px solid #E5E5EA'
                    }}
                  >
                    Income
                  </button>
                  <button
                    onClick={() => {
                      setTransactionType('savings');
                      setSelectedCategory('All');
                      setSelectedSubcategory('All');
                    }}
                    className="px-4 py-1.5 transition-all text-sm font-medium"
                    style={{
                      backgroundColor: transactionType === 'savings' ? '#F2F2F7' : 'transparent',
                      color: transactionType === 'savings' ? '#1C1C1E' : '#8E8E93'
                    }}
                  >
                    Savings
                  </button>
                </div>
                
                {/* Year Filter */}
                <div style={{ 
                  WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)', 
                  isolation: 'isolate',
                  transform: 'translateZ(0)'
                }}>
                  <select
                    value={trendYearFilter}
                    onChange={(e) => setTrendYearFilter(Number(e.target.value))}
                    className="px-2.5 py-1 rounded-md text-xs text-neutral-600 border border-neutral-200"
                    style={{ 
                      WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      touchAction: 'manipulation',
                      backgroundColor: '#FAFAFA',
                      transform: 'translateZ(0)',
                      willChange: 'background-color'
                    }}
                  >
                    {getAvailableYears().map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Sticky Category Selector */}
            {transactionType !== 'savings' && (() => {
              // Get available categories sorted alphabetically
              const availableCategories = trendSortedCategories
                .map(c => c.name)
                .sort((a, b) => a.localeCompare(b));
              
              // Get available subcategories for selected category (using trend-filtered transactions)
              const getAvailableSubcategories = () => {
                if (selectedCategory === 'All') return [];
                const categoryExpenses = trendFilteredTransactions.filter(e => e.category.name === selectedCategory);
                const subcategoryTotals: Record<string, number> = {};
                
                categoryExpenses.forEach(expense => {
                  if (expense.subcategory) {
                    subcategoryTotals[expense.subcategory] = (subcategoryTotals[expense.subcategory] || 0) + expense.amount;
                  }
                });
                
                return Object.keys(subcategoryTotals).sort((a, b) => a.localeCompare(b));
              };
              
              const availableSubcategories = getAvailableSubcategories();
              
              // Get selected category icon
              const selectedCategoryObj = selectedCategory !== 'All' ? trendCategoryList.find(c => c.name === selectedCategory) : null;
              
              return (
                <div className="sticky top-0 z-10 bg-white border-b border-neutral-100 px-6 py-2">
                  <div className="flex items-center gap-1.5">
                    {/* Category Filter Button */}
                    <button
                      onClick={() => setIsTrendCategoryModalOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors"
                    >
                      {selectedCategoryObj && (() => {
                        const Icon = getCategoryIcon(selectedCategoryObj.icon);
                        return <Icon className="w-3.5 h-3.5 text-neutral-500" strokeWidth={2} />;
                      })()}
                      <span className="text-neutral-600 text-xs">{selectedCategory === 'All' ? 'All Categories' : selectedCategory}</span>
                      <ChevronDown className="w-3 h-3 text-neutral-400" />
                    </button>
                    
                    {/* Subcategory toggle — appears right next to the category
                        toggle once a category (with subcategories) is selected,
                        mirroring the category toggle. Opens the subcategory
                        picker (which includes "All" to reset). */}
                    {selectedCategory !== 'All' && availableSubcategories.length > 0 && (
                      <button
                        onClick={() => setIsTrendSubcategoryModalOpen(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg transition-colors"
                        style={selectedSubcategory === 'All'
                          ? { backgroundColor: '#FFFFFF', borderColor: '#E5E5EA' }
                          : { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }}
                      >
                        <span className="text-xs" style={{ color: selectedSubcategory === 'All' ? '#525252' : '#2563EB' }}>
                          {selectedSubcategory === 'All' ? 'All Subcategories' : selectedSubcategory}
                        </span>
                        <ChevronDown className="w-3 h-3" style={{ color: selectedSubcategory === 'All' ? '#A3A3A3' : '#60A5FA' }} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Summary Cards */}
            <div className="px-6 py-4 bg-white mb-2">
              {transactionType === 'savings' ? (() => {
                // The saving rate is averaged across months rather than taken
                // over the totals, so one unusually fat month cannot speak for
                // all the others.
                const monthlySavingRates: number[] = [];

                trendData.forEach(month => {
                  const monthStart = new Date(month.year, getMonthNumber(month.month), 1);
                  const monthEnd = new Date(month.year, getMonthNumber(month.month) + 1, 0, 23, 59, 59, 999);
                  
                  const monthExpenses = expenses.filter(expense => {
                    const expenseDate = parseLocalDate(expense.date);
                    return expenseDate >= monthStart && expenseDate <= monthEnd;
                  });
                  
                  const monthIncome = monthExpenses.filter(e => e.type === 'income').reduce((sum, e) => sum + homeAmount(e, currency), 0);
                  const monthSpending = monthExpenses.filter(e => e.type !== 'income').reduce((sum, e) => sum + homeAmount(e, currency), 0);

                  if (monthIncome > 0) {
                    monthlySavingRates.push(((monthIncome - monthSpending) / monthIncome) * 100);
                  }
                });

                const avgMonthlySavingRate = monthlySavingRates.length > 0
                  ? monthlySavingRates.reduce((sum, rate) => sum + rate, 0) / monthlySavingRates.length
                  : 0;

                return (
                  <div className="grid grid-cols-2 gap-2">
                    <TrendStatCard
                      label="Total Saved"
                      value={formatAmountListView(totalSpent, currency, 0)}
                      compact={formatAbbreviatedAmount(totalSpent, currency)}
                      valueColor={savingsColor(totalSpent)}
                      footnote={trendData.length === 1 ? "This month" : `${trendData.length} months`}
                    />
                    <TrendStatCard
                      label="Monthly Average"
                      value={formatAmountListView(avgAmount, currency, 0)}
                      compact={formatAbbreviatedAmount(avgAmount, currency)}
                      valueColor={savingsColor(avgAmount)}
                      // A rate needs income to divide by. With none recorded there
                      // is nothing to report, and "0%" would read as "you saved
                      // nothing" - which is a different statement entirely.
                      footnote={
                        monthlySavingRates.length > 0 ? (
                          <StatChip
                            // Below ~360px the full label would be truncated to
                            // "Saving ..."; dropping the first word is a better
                            // reading of the same thing.
                            label={<><span className="max-[359px]:hidden">Saving </span>Rate</>}
                            value={`${Math.round(avgMonthlySavingRate)}%`}
                            tone={Math.round(avgMonthlySavingRate)}
                          />
                        ) : (
                          'No income recorded'
                        )
                      }
                    />
                  </div>
                );
              })() : (() => {
                // What used to be a standalone "Transactions" tile is now a
                // footnote under each number it belongs to: how many
                // transactions make up the total, and how many make up a
                // typical month. Income gets neither - a count of salary
                // payments is not a thing anyone wonders about.
                const isExpense = transactionType === "expense";
                const months = trendData.length === 1 ? "This month" : `${trendData.length} months`;
                const txCount = trendData.reduce((sum, month) => sum + month.count, 0);
                const avgTxCount = trendData.length > 0 ? Math.round(txCount / trendData.length) : 0;
                const transactions = (n: number) => `${n} ${n === 1 ? "transaction" : "transactions"}`;

                return (
                  <div className="grid grid-cols-2 gap-2">
                    <TrendStatCard
                      label={isExpense ? "Total Spent" : "Total Earned"}
                      value={formatAmountListView(totalSpent, currency, 0)}
                      compact={formatAbbreviatedAmount(totalSpent, currency)}
                      footnote={isExpense ? `${months} · ${transactions(txCount)}` : months}
                    />
                    <TrendStatCard
                      label="Monthly Average"
                      value={formatAmountListView(avgAmount, currency, 0)}
                      compact={formatAbbreviatedAmount(avgAmount, currency)}
                      footnote={isExpense ? transactions(avgTxCount) : undefined}
                    />
                  </div>
                );
              })()}
            </div>

            {/* Line Chart */}
            <div className="px-6 py-4 bg-white mb-2">
              <h3 className="text-neutral-900 font-semibold text-sm mb-3">
                {transactionType === 'income' ? 'Monthly Income' : transactionType === 'savings' ? 'Monthly Savings' : 'Monthly Spending'}
              </h3>
              
              {trendData.length === 0 ? (
                <div className="text-center py-8 text-neutral-400 text-sm">
                  No data available
                </div>
              ) : (
                <>
                  <div className="relative">
                    {/* Y-axis labels */}
                    <div className="absolute left-0 top-0 h-24 flex flex-col justify-between text-[10px] text-neutral-400 tabular-nums pr-2 w-12 font-medium">
                      <span>{formatAmountListView(yMax, currency, 0)}</span>
                      <span>{formatAmountListView(yMin + yRange / 2, currency, 0)}</span>
                      <span>{formatAmountListView(yMin, currency, 0)}</span>
                    </div>
                    
                    {/* Chart container */}
                    <div className="ml-14 mr-2" style={{ height: '96px' }}>
                      <svg 
                        width="100%" 
                        height="96" 
                        viewBox="0 0 320 96"
                        className="overflow-visible"
                        preserveAspectRatio="xMinYMin meet"
                      >
                        <defs>
                          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.1" />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
                          </linearGradient>
                        </defs>
                        <g transform="translate(0, 4)">
                          {/* Grid lines - minimized prominence */}
                          <line x1="0" y1="0" x2="320" y2="0" stroke="#F1F1F1" strokeWidth="0.5" />
                          <line x1="0" y1="44" x2="320" y2="44" stroke="#F1F1F1" strokeWidth="0.5" />
                          <line x1="0" y1="88" x2="320" y2="88" stroke="#F1F1F1" strokeWidth="0.5" />
                          
                          {/* Average line (dashed, discreet) */}
                          {avgAmount > 0 && yRange > 0 && (() => {
                            const avgY = 88 - ((avgAmount - yMin) / yRange) * 88;
                            return (
                              <line 
                                x1="0" 
                                y1={avgY}
                                x2="320" 
                                y2={avgY}
                                stroke="#A3A3A3" 
                                strokeWidth="1" 
                                strokeDasharray="4 4"
                                opacity="0.25"
                              />
                            );
                          })()}
                          
                          {/* Trend Area Fill */}
                          {trendData.length > 1 && (
                            <path
                              d={`
                                M 0,88 
                                ${trendData.map((item, index) => {
                                  const x = (index / (trendData.length - 1)) * 320;
                                  const y = yRange > 0 ? 88 - ((item.amount - yMin) / yRange) * 88 : 44;
                                  return `L ${x},${y}`;
                                }).join(' ')}
                                L 320,88 Z
                              `}
                              fill="url(#trendGradient)"
                            />
                          )}
                          
                          {/* Trend line - Smoother & Accent Color */}
                          {trendData.length > 1 && (
                            <path
                              d={(() => {
                                // Simple path generator
                                const points = trendData.map((item, index) => ({
                                  x: (index / (trendData.length - 1)) * 320,
                                  y: yRange > 0 ? 88 - ((item.amount - yMin) / yRange) * 88 : 44
                                }));
                                
                                return points.reduce((acc, point, i, a) => {
                                  if (i === 0) return `M ${point.x},${point.y}`;
                                  
                                  // Add slight curve smoothing
                                  const prev = a[i - 1];
                                  const cp1x = prev.x + (point.x - prev.x) / 3;
                                  const cp2x = prev.x + (point.x - prev.x) * 2 / 3;
                                  return `${acc} C ${cp1x},${prev.y} ${cp2x},${point.y} ${point.x},${point.y}`;
                                }, '');
                              })()}
                              fill="none"
                              stroke="#3B82F6"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                          
                          {/* Data points - minimal visibility, invisible until interaction (handled by CSS hover) */}
                          {trendData.map((item, index) => {
                            const x = trendData.length > 1 ? (index / (trendData.length - 1)) * 320 : 160;
                            const y = yRange > 0 ? 88 - ((item.amount - yMin) / yRange) * 88 : 44;
                            
                            return (
                              <g key={index} className="group cursor-pointer">
                                {/* Invisible larger touch/hover area */}
                                <circle cx={x} cy={y} r="12" fill="transparent" />
                                {/* Main dot - visible only on group hover/interaction */}
                                <circle
                                  cx={x}
                                  cy={y}
                                  r="4"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                  fill="#FFFFFF"
                                  stroke="#3B82F6"
                                  strokeWidth="2.5"
                                />
                                {/* Tiny resting dot */}
                                <circle
                                  cx={x}
                                  cy={y}
                                  r="1.5"
                                  className="opacity-40 group-hover:opacity-0 transition-opacity duration-200"
                                  fill="#3B82F6"
                                />
                              </g>
                            );
                          })}
                        </g>
                      </svg>
                    </div>
                  </div>
                  
                  {/* Month labels */}
                  <div className="relative ml-14 mr-2 mt-4 h-3">
                    {trendData.map((item, index) => {
                      const leftPosition = trendData.length > 1 ? (index / (trendData.length - 1)) * 100 : 50;
                      return (
                        <div 
                          key={index} 
                          className="absolute text-[10px] text-neutral-400 font-medium transform -translate-x-1/2"
                          style={{ left: `${leftPosition}%` }}
                        >
                          {item.month}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Monthly Breakdown - High Density */}
            <div className="px-6 py-3 bg-white mb-2">
              <h3 className="text-neutral-900 font-semibold text-sm mb-2">Monthly Breakdown</h3>
              
              {/* Column headers. Shown whenever a row carries more than one
                  number - a category drilldown (weight + count) or the savings
                  view (rate), where an unlabelled "-12%" next to an unlabelled
                  amount left the reader to guess which was which.
                  Widths mirror the row below exactly; both branch on the same
                  two conditions. */}
              {(selectedCategory !== 'All' || transactionType === 'savings') && (
                <div className="flex items-center gap-2.5 pb-1.5 mt-2 mb-1 border-b border-neutral-100">
                  {/* Month spacer */}
                  <div className="w-12 flex-shrink-0"></div>
                  {/* Bar chart spacer */}
                  <div className={`${selectedCategory === 'All' ? 'flex-1' : 'w-32'} min-w-0`}></div>
                  {/* Amount header */}
                  <div className={`${selectedCategory === 'All' ? 'w-16' : 'w-14'} flex-shrink-0 text-right text-[9px] text-neutral-400 uppercase tracking-wide`}>
                    {transactionType === 'savings' ? 'Saved' : 'Amount'}
                  </div>
                  {selectedCategory !== 'All' && (
                    <>
                      {/* Weight header */}
                      <div className="w-10 flex-shrink-0 text-right text-[9px] text-neutral-400 uppercase tracking-wide">
                        Weight
                      </div>
                      {/* Transaction count header */}
                      <div className="w-8 flex-shrink-0 text-center text-[9px] text-neutral-400 uppercase tracking-wide">
                        #
                      </div>
                    </>
                  )}
                  {/* Saving rate header */}
                  {transactionType === 'savings' && (
                    <div className="w-10 flex-shrink-0 text-right text-[9px] text-neutral-400 uppercase tracking-wide">
                      Rate
                    </div>
                  )}
                  {/* Badges spacer */}
                  <div className="w-11 flex-shrink-0"></div>
                </div>
              )}
              
              <div className="space-y-0">
                {trendData.map((item, index) => {
                  const isCurrentMonth = index === currentMonthIndex;
                  const isMaxMonth = index === maxMonthIndex;
                  const isMaxAbsMonth = index === maxAbsMonthIndex; // For bar visualization
                  
                  // Calculate saving rate for this month if in savings view
                  let monthlySavingRate = 0;
                  if (transactionType === 'savings') {
                    const monthStart = new Date(item.year, getMonthNumber(item.month), 1);
                    const monthEnd = new Date(item.year, getMonthNumber(item.month) + 1, 0, 23, 59, 59, 999);
                    
                    const monthExpenses = expenses.filter(expense => {
                      const expenseDate = parseLocalDate(expense.date);
                      return expenseDate >= monthStart && expenseDate <= monthEnd;
                    });
                    
                    const monthIncome = monthExpenses.filter(e => e.type === 'income').reduce((sum, e) => sum + homeAmount(e, currency), 0);
                    const monthSpending = monthExpenses.filter(e => e.type !== 'income').reduce((sum, e) => sum + homeAmount(e, currency), 0);
                    
                    if (monthIncome > 0) {
                      monthlySavingRate = ((monthIncome - monthSpending) / monthIncome) * 100;
                    }
                  }
                  
                  // Bar length is a share of the biggest month, measured from
                  // zero. Scaling the smallest month to an empty bar instead
                  // (as this did) turns a 3,329 / 3,931 spread - 18% - into the
                  // difference between nothing and a full bar, which reads as
                  // wild volatility in a steady year.
                  let barWidth = 0;
                  const barMax = Math.max(...allAmounts.map(a => Math.abs(a)), 0);
                  const barValue = Math.abs(item.amount);
                  if (barMax > 0 && barValue > 0) {
                    barWidth = Math.max(2, (barValue / barMax) * 100);
                  }

                  // One rule for all three toggles. Savings used to skip the bar
                  // entirely on a negative month, so the worst month of the year
                  // looked like an empty one; it now draws its size like any
                  // other and carries the colour instead.
                  const isLossMonth = transactionType === 'savings' && item.amount < 0;
                  const onlyMonth = trendData.length === 1;
                  const barClass = isLossMonth
                    ? 'bg-red-400'
                    : onlyMonth || (trendData.length > 1 && index === worstMonthIndex && transactionType === 'expense')
                      ? (transactionType === 'expense' ? 'bg-red-400' : 'bg-green-400')
                      : trendData.length > 1 && index === bestMonthIndex && transactionType !== 'expense' && item.amount > 0
                        ? 'bg-green-400'
                        : 'bg-neutral-400';
                  
                  const maxColor = transactionType === 'expense' ? 'red' : 'green';
                  
                  return (
                    <button
                      key={`${item.month}-${item.year}`}
                      onClick={() => {
                        // Navigate to the Overview tab with this month selected
                        onShowOverview?.({
                          month: getMonthNumber(item.month),
                          year: item.year,
                          type: transactionType === 'savings' ? 'expense' : transactionType
                        });
                      }}
                      className="w-full flex items-center gap-2.5 py-2.5 active:bg-neutral-50 transition-colors"
                    >
                      {/* Month */}
                      <div className={`w-12 flex-shrink-0 text-left text-[11px] tabular-nums self-center ${
                        trendData.length > 1 && isMaxMonth ? `text-${maxColor}-600 font-medium` : 'text-neutral-600'
                      }`}>
                        {item.month}
                      </div>
                      
                      {/* Visual indicator - mini bar */}
                      <div className={`${selectedCategory === 'All' ? 'flex-1' : 'w-32'} min-w-0 h-1.5 bg-neutral-100 rounded-full overflow-hidden self-center`}>
                        <div
                          className={`h-full rounded-full transition-all ${barClass}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      
                      {/* Amount */}
                      <div className={`${selectedCategory === 'All' ? 'w-16' : 'w-14'} flex-shrink-0 text-xs font-semibold tabular-nums text-right self-center ${
                        trendData.length > 1 && isMaxMonth ? `text-${maxColor}-900` : 'text-neutral-900'
                      }`}>
                        {formatAmountListView(item.amount, currency, 0)}
                      </div>
                      
                      {/* Weight % - only for category/subcategory */}
                      {selectedCategory !== 'All' && (
                        <div className="flex-shrink-0 w-10 text-right text-[11px] text-neutral-400 tabular-nums self-center">
                          {item.amount > 0 ? `${item.percentage.toFixed(0)}%` : '-'}
                        </div>
                      )}
                      
                      {/* Transaction count - only for category/subcategory */}
                      {selectedCategory !== 'All' && (
                        <div className="flex-shrink-0 w-8 text-center text-[11px] text-neutral-500 tabular-nums self-center">
                          {item.count > 0 ? item.count : '-'}
                        </div>
                      )}
                      
                      {/* Saving Rate % - only for savings view */}
                      {transactionType === 'savings' && (
                        <div 
                          className="flex-shrink-0 w-10 text-right text-[11px] tabular-nums font-medium self-center"
                          style={{ 
                            color: monthlySavingRate < 0 ? '#EF4444' : monthlySavingRate > 0 ? '#10B981' : '#8E8E93'
                          }}
                        >
                          {monthlySavingRate !== 0 ? `${Math.round(monthlySavingRate)}%` : '-'}
                        </div>
                      )}
                      
                      {/* Badges */}
                      <div className="flex-shrink-0 w-11 flex justify-end self-center">
                        {trendData.length > 1 && index === bestMonthIndex && item.amount > 0 && (
                          <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium leading-none">
                            Best
                          </span>
                        )}
                        {trendData.length > 1 && index === worstMonthIndex && item.amount !== 0 && index !== bestMonthIndex && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium leading-none">
                            Worst
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category Breakdown Table - Only for Expenses and Income */}
            {transactionType !== 'savings' && selectedCategory === 'All' && trendFilteredTransactions.length > 0 && (
              <TrendCategoryBreakdown
                trendFilteredTransactions={trendFilteredTransactions}
                trendSortedCategories={trendSortedCategories}
                trendExpandedCategory={trendExpandedCategory}
                setTrendExpandedCategory={setTrendExpandedCategory}
                currency={currency}
              />
            )}
          </div>
        );
      })()}

      {/* Category Filter Modal for Trend View */}
      <CategoryFilterModal
        isOpen={isTrendCategoryModalOpen}
        selectedCategory={selectedCategory}
        onClose={() => setIsTrendCategoryModalOpen(false)}
        onSelectCategory={(category) => {
          setSelectedCategory(category);
          setSelectedSubcategory('All');
          setIsTrendCategoryModalOpen(false);
        }}
        transactionType={transactionType === 'expense' ? 'expense' : transactionType === 'income' ? 'income' : 'expense'}
        categories={categories}
        incomeCategories={incomeCategories}
      />

      {/* Subcategory Filter Modal for Trend View */}
      <SubcategoryFilterModal
        isOpen={isTrendSubcategoryModalOpen}
        selectedSubcategory={selectedSubcategory}
        onClose={() => setIsTrendSubcategoryModalOpen(false)}
        onSelectSubcategory={(subcategory) => {
          setSelectedSubcategory(subcategory);
          setIsTrendSubcategoryModalOpen(false);
        }}
        availableSubcategories={(() => {
          if (selectedCategory === 'All') return [];
          const getSubcategoryTotals = (categoryName: string) => {
            const categoryTransactions = expenses.filter(e => {
              const typeMatch = transactionType === 'expense' ? e.type !== 'income' : e.type === 'income';
              return typeMatch && e.category.name === categoryName && e.subcategory;
            });
            
            const subcategoryTotals = categoryTransactions.reduce((acc, expense) => {
              const subcatName = expense.subcategory || 'Other';
              acc[subcatName] = (acc[subcatName] || 0) + expense.amount;
              return acc;
            }, {} as Record<string, number>);
            
            return Object.entries(subcategoryTotals)
              .map(([name, amount]) => ({ name, amount }))
              .sort((a, b) => b.amount - a.amount);
          };
          return getSubcategoryTotals(selectedCategory).map(s => s.name);
        })()}
      />

      {/* Drilldown Transaction Modal */}
      {drilldownContext && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm transition-all duration-300">
          <div 
            className="bg-white w-full max-w-[430px] h-[85vh] sm:h-[700px] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ 
              // Add padding for the home indicator/safe area at the bottom if needed, 
              // but mostly we want to ensure the top is clean
            }}
          >
            {/* Header */}
            <div className="bg-white flex-shrink-0 border-b border-neutral-100">
              {/* Top Level: Primary Controls */}
              <div className="px-6 pt-8 pb-1 flex items-center justify-end">
                <button
                  onClick={() => {
                    setDrilldownContext(null);
                    setDrilldownSortBy('time');
                  }}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white active:scale-90 transition-all cursor-pointer"
                  style={{ backgroundColor: '#3A3A3C' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Second Level: Informational Content & Secondary Controls */}
              <div className="px-6 pb-6 pt-1 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h3 className="text-xl font-bold text-neutral-900 leading-tight">
                      {drilldownContext.subcategoryName
                        ? (drilldownContext.subcategoryName === UNCATEGORIZED ? 'Other' : drilldownContext.subcategoryName)
                        : drilldownContext.categoryName}
                    </h3>
                    {drilldownContext.subcategoryName && (
                      <span className="text-[10px] text-neutral-400 font-bold px-2 py-0.5 bg-neutral-50 rounded-full border border-neutral-100 uppercase tracking-tight">
                        {drilldownContext.categoryName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span className="text-neutral-500">{getPeriodDisplayName()}</span>
                    <span className="text-neutral-300">·</span>
                    <span style={{ color: transactionType === 'expense' ? '#D32F2F' : '#2E7D32' }}>
                      {formatAmountListView(
                        drilldownTransactions.reduce((sum, txn) => sum + homeAmount(txn, currency), 0),
                        currency,
                        0
                      )}
                    </span>
                  </div>
                </div>
                
                <div className="flex-shrink-0 pt-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrilldownSortBy(prev => prev === 'time' ? 'amount' : 'time');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 cursor-pointer h-9"
                    style={{ backgroundColor: '#E5E5EA' }}
                    aria-label="Toggle sort order"
                  >
                    {drilldownSortBy === 'time' ? (
                      <>
                        <Clock className="w-3.5 h-3.5" style={{ color: '#3A3A3C' }} />
                        <span className="text-[10px] font-bold tracking-wide" style={{ color: '#3A3A3C' }}>TIME</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpDown className="w-3.5 h-3.5" style={{ color: '#3A3A3C' }} />
                        <span className="text-[10px] font-bold tracking-wide" style={{ color: '#3A3A3C' }}>AMOUNT</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            {/* List */}
            <div className="flex-1 overflow-y-auto pb-10 bg-[#F5F5F7]">
              {drilldownList.mode === 'empty' ? (
                <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                    <Receipt className="w-8 h-8 text-neutral-300" />
                  </div>
                  <p className="text-neutral-500 text-sm font-medium">No transactions found for this selection.</p>
                </div>
              ) : drilldownList.mode === 'amount' ? (
                // Ranked by amount: flat list, each row carries its own date
                <div className="bg-white">
                  {drilldownList.items.map((txn) => {
                    const handleTap = (id: string) => {
                      onEditExpense(id);
                      setDrilldownContext(null);
                    };
                    return txn.type === 'income' ? (
                      <IncomeItem
                        key={txn.id}
                        income={txn as any}
                        showDate
                        onTap={handleTap}
                        onDelete={onDeleteExpense}
                        currency={currency}
                      />
                    ) : (
                      <ExpenseItem
                        key={txn.id}
                        expense={txn as any}
                        showDate
                        onTap={handleTap}
                        onDelete={onDeleteExpense}
                        currency={currency}
                      />
                    );
                  })}
                </div>
              ) : (
                drilldownList.groups.map(([date, dayTxns]) => (
                  <ActivityDayGroup
                    key={date}
                    date={date}
                    transactions={dayTxns as any}
                    onTransactionTap={(id) => {
                      onEditExpense(id);
                      setDrilldownContext(null);
                    }}
                    onDeleteTransaction={onDeleteExpense}
                    currency={currency}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}