import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronRight, ArrowUpDown, TrendingUp, TrendingDown, Minus, Plus, Receipt, ChevronLeft, ChevronDown, X, Wallet, Gauge } from 'lucide-react';
import { TrendCategoryBreakdown } from './TrendCategoryBreakdown';
import React from 'react';
import { formatAmountListView, formatAbbreviatedAmount, CURRENCIES, homeAmount } from '../utils/currency';
import { monthsShort, monthsFull, daysFull, daysShort, numberLocale, getLanguage } from '../i18n/store';
import { t } from '../i18n';
import { translateRecurrence } from '../i18n/store';
import { getCategoryIcon } from './categoryIcons';
import { categoryHex } from './categoryColors';
import { usualCurve, periodCurve } from '../lib/usual';
import { dayOfWeekBreakdown, dowTakeaway } from '../lib/dayOfWeek';
import { BudgetBar, BudgetNudge } from './BudgetBar';
import { FitText } from './FitText';
import { AmountText, AmountFromText } from './AmountText';
import { parseLocalDate } from '../lib/dates';
import { CategoryFilterModal } from './CategoryFilterModal';
import { SubcategoryFilterModal } from './SubcategoryFilterModal';
import { PeriodPickerModal } from './PeriodPickerModal';
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

// Y-axis tick label. One notation per axis, decided by its top tick: an axis
// that reads "10k, 8,000, 6,000" is switching units halfway down.
// The period summary builds its sentences as strings - it measures them to
// decide how much to say, and reshapes them with replace() - so the amounts
// inside cannot be React nodes at the point they are written. They are fenced
// with an invisible separator instead, and InsightLine turns each fenced run
// back into a typeset amount at render. U+2063 is zero-width and carries no
// meaning of its own, so a sentence that somehow escapes the renderer still
// reads correctly.
const AMOUNT_MARK = '⁣';

function InsightLine({ text }: { text: string }) {
  return (
    <>
      {text.split(AMOUNT_MARK).map((part, i) =>
        // Odd indices are what sat between a pair of marks.
        i % 2 === 1 ? <AmountFromText key={i} text={part} /> : part
      )}
    </>
  );
}

function formatAxisTick(value: number, axisMax: number): string {
  if (value === 0) return '0'; // "0k" is nonsense in any notation
  if (axisMax >= 10000) {
    return `${(value / 1000).toLocaleString(numberLocale(), { maximumFractionDigits: 1, useGrouping: false })}k`;
  }
  return Math.round(value).toLocaleString(numberLocale());
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
  drilldownContext: { categoryName: string; subcategoryName: string | null; recurrence?: string } | null;
  drilldownSortBy: 'time' | 'amount';
  comparisonBaseline: ComparisonBaseline;
  categorySortBy: 'alphabetical' | 'amount';
  recurrenceLayer: 'overview' | 'detail';
  selectedRecurrenceSlice: string | null;
  cumulativeBenchmark: 'usual' | 'lastYear';
}

// Trend keeps almost no view state - but its Expense/Income/Savings toggle
// and expanded category must survive the remounts App forces via refreshKey
// (a background sync pull, recurring materialisation on foreground). Those
// fire exactly when the phone dims to lock, which read as the toggle
// "resetting on its own". Cleared by App when the user leaves the tab, so a
// fresh visit still starts on Expense.
export interface TrendViewState {
  transactionType: 'expense' | 'income' | 'savings';
  trendExpandedCategory: string | null;
  trendYearFilter: number;
  selectedCategory: string;
  selectedSubcategory: string;
  // The breakdown card's alternate view (expenses only) and its own scopes.
  trendBreakdown: 'monthly' | 'dow';
  trendDowMonth: number | null;
  trendDowOneOffs: boolean;
}

// What the trend column measures against. 'previous' tracks the period
// immediately before the selected one as the user navigates. 'average' is the
// mean of every prior period that holds data. A number pins one specific
// period, held as an ABSOLUTE index (see periodIndex) rather than an offset -
// pin March and it stays March as you move around, which is what "compare
// against that month" means. An offset would quietly slide to February.
export type ComparisonBaseline = 'previous' | 'average' | number;

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
  trendStateRef?: React.MutableRefObject<TrendViewState | null>;
  monthlyBudget?: number;
  /** True once the user has waved away the "set a budget" card. */
  budgetNudgeDismissed?: boolean;
  onSetMonthlyBudget?: (value: number) => void;
  onDismissBudgetNudge?: () => void;
  // First-run: with an empty ledger the Overview shows one clear next action
  // instead of a page of zeros. Both open flows that already exist elsewhere.
  onAddFirstExpense?: () => void;
  onLoadDemoData?: () => void;
  /** First day of the week for the day-of-week breakdown (Settings > Profile). */
  weekStartsOn?: number;
}

// Sentinel drilldown target: only the transactions with no subcategory
// ("Other"). Distinctive enough that it can't collide with a real
// subcategory name. (A null subcategory already means "all transactions".)
const UNCATEGORIZED = '__uncategorized__';

// Same treatment as the Overview hero card, so the headline numbers on both
// tabs look like they belong to the same app.
const TREND_STAT_CARD: React.CSSProperties = {
  background: 'radial-gradient(120% 120% at 90% -20%, rgba(99,102,241,0.30) 0%, rgba(59,130,246,0.12) 42%, rgba(28,28,30,0) 68%), radial-gradient(100% 100% at 6% 118%, rgba(59,130,246,0.10) 0%, rgba(99,102,241,0.04) 45%, rgba(28,28,30,0) 72%), linear-gradient(150deg, #2E2E32 0%, #1C1C1E 100%)',
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
  compactNode,
  footnote,
  corner,
  valueColor = '#FFFFFF',
}: {
  label: string;
  value: React.ReactNode;
  compact: string;
  compactNode?: React.ReactNode;
  footnote?: React.ReactNode;
  // Small note on the label row's right edge (e.g. "3 months") - context that
  // would otherwise cost a whole footnote line above the Saving Rate panel.
  corner?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-2xl px-4 py-3.5 flex flex-col min-w-0" style={TREND_STAT_CARD}>
      <div className="flex items-baseline justify-between gap-2 text-[11px] leading-tight mb-1.5">
        <span style={{ color: 'rgba(235,235,245,0.6)' }}>{label}</span>
        {corner && (
          <span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(235,235,245,0.45)' }}>{corner}</span>
        )}
      </div>
      {/* No padding on this wrapper: FitText measures its parent's clientWidth,
          which would include the card's own padding. */}
      <div className="min-w-0">
        <FitText
          max={17}
          min={14}
          compact={compact}
          compactNode={compactNode}
          className="font-bold leading-none tabular-nums"
          style={{ color: valueColor }}
        >
          {value}
        </FitText>
      </div>
      {footnote && (
        <div className="text-[10px] leading-tight mt-auto pt-2" style={{ color: 'rgba(235,235,245,0.55)' }}>
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

// The cumulative chart's box width, remembered across remounts. Deliberately
// module scope: this is how wide the phone is, which no remount changes, and
// starting from it means the first render already draws at the right scale.
let lastChartWidth = 0;

export function Dashboard({ expenses, categories, incomeCategories, sources = [], userName, currency, onEditExpense, onDeleteExpense, view = 'overview', onShowOverview, initialPeriod, viewStateRef, trendStateRef, monthlyBudget, budgetNudgeDismissed, onSetMonthlyBudget, onDismissBudgetNudge, onAddFirstExpense, onLoadDemoData, weekStartsOn = 1 }: DashboardProps) {
  // Restore the previous view (period + drilldown) unless a Trend->Overview
  // link supplied an explicit period - that must win and start clean.
  const savedView = view === 'overview' && !initialPeriod ? viewStateRef?.current ?? null : null;
  const savedTrend = view === 'trend' ? trendStateRef?.current ?? null : null;
  const viewType: ViewType = view === 'trend' ? 'trend' : 'current-month';
  const [timePeriodType, setTimePeriodType] = useState<TimePeriodType>(savedView?.timePeriodType ?? 'month');
  // Measure the cumulative chart's real pixel width so its SVG renders 1:1
  // (no aspect-ratio stretching that would deform the line dot / axis text).
  //
  // Measured on the ref callback, which React runs during the commit - before
  // the browser paints - and seeded from the last width this session. The
  // width is a property of the viewport, not of the data, so it survives the
  // remounts App triggers on a sync pull. Measuring in an effect instead meant
  // every remount painted one frame at the 340-unit fallback inside a ~294px
  // box: the whole chart appeared scaled down, then snapped back a frame
  // later. That flicker is what a phone left open showed on every poll.
  const [chartWidth, setChartWidth] = useState(lastChartWidth);
  const chartBoxCleanup = useRef<(() => void) | null>(null);
  const chartBoxRef = useCallback((el: HTMLDivElement | null) => {
    chartBoxCleanup.current?.();
    chartBoxCleanup.current = null;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) {
        lastChartWidth = w;
        setChartWidth(w);
      }
    };
    measure();
    // Rotation, a keyboard opening, an iPad split view: the box can change
    // width without the window firing resize, and vice versa.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      chartBoxCleanup.current = () => ro.disconnect();
    } else {
      window.addEventListener('resize', measure);
      chartBoxCleanup.current = () => window.removeEventListener('resize', measure);
    }
  }, []);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(savedView?.expandedCategory ?? null);
  const [trendExpandedCategory, setTrendExpandedCategory] = useState<string | null>(savedTrend?.trendExpandedCategory ?? null);
  const [selectedCategory, setSelectedCategory] = useState<string>(savedTrend?.selectedCategory ?? 'All');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(savedTrend?.selectedSubcategory ?? 'All');
  // Restored on remount like every other choice on this screen: App re-keys
  // Dashboard whenever refreshKey moves (a background sync pull, a recurring
  // occurrence materialising), and that was silently putting the list back to
  // A-Z seconds after the user sorted it by amount.
  const [categorySortBy, setCategorySortBy] = useState<CategorySortType>(savedView?.categorySortBy ?? 'alphabetical');
  const [drilldownSortBy, setDrilldownSortBy] = useState<'time' | 'amount'>(savedView?.drilldownSortBy ?? 'time');
  const [comparisonBaseline, setComparisonBaseline] = useState<ComparisonBaseline>(savedView?.comparisonBaseline ?? 'previous');
  // What the cumulative chart's dotted line is: the median of recent periods
  // ("Your usual") or the same period one year back. Chosen from the legend.
  const [cumulativeBenchmark, setCumulativeBenchmark] = useState<'usual' | 'lastYear'>(savedView?.cumulativeBenchmark ?? 'usual');
  const [transactionType, setTransactionType] = useState<TransactionType>(initialPeriod?.type || savedView?.transactionType || savedTrend?.transactionType || 'expense');
  const [isTrendCategoryModalOpen, setIsTrendCategoryModalOpen] = useState(false);
  const [isTrendSubcategoryModalOpen, setIsTrendSubcategoryModalOpen] = useState(false);
  // Deliberately NOT in the saved view state: a sheet that reopened itself on
  // every remount would be a worse bug than the one it fixes.
  const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false);
  
  // State for drill-down modal
  const [drilldownContext, setDrilldownContext] = useState<{
    categoryName: string;
    subcategoryName: string | null;
    // Set by the One-off vs Recurring chart's second layer: the modal then
    // lists the transactions of ONE cadence ("Every month") instead of a
    // category - same view, same sorting, different filter.
    recurrence?: string;
  } | null>(savedView?.drilldownContext ?? null);
  
  // State for recurrence donut chart
  const [recurrenceLayer, setRecurrenceLayer] = useState<'overview' | 'detail'>(savedView?.recurrenceLayer ?? 'overview');
  const [selectedRecurrenceSlice, setSelectedRecurrenceSlice] = useState<string | null>(savedView?.selectedRecurrenceSlice ?? null);
  
  // State for manual tooltip positioning
  const [tooltipData, setTooltipData] = useState<{
    x: number;
    y: number; // where the marker sits: the real line, or the benchmark on a future day
    label: string;
    value: number | null; // null past today in a running period
    usual: number | null;
    usualY: number | null;
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
      comparisonBaseline,
      cumulativeBenchmark,
      categorySortBy,
      recurrenceLayer,
      selectedRecurrenceSlice,
    };
  }, [view, viewStateRef, timePeriodType, selectedMonth, selectedQuarter, selectedYear, transactionType, expandedCategory, drilldownContext, drilldownSortBy, comparisonBaseline, categorySortBy, recurrenceLayer, selectedRecurrenceSlice, cumulativeBenchmark]);


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
      // The recurrence chart under the savings toggle counts every
      // transaction, so its drilldown must too.
      const typeMatch =
        drilldownContext.recurrence && transactionType === 'savings'
          ? true
          : transactionType === 'income' ? expense.type === 'income' : expense.type !== 'income';
      if (!typeMatch) return false;

      const expenseDate = parseLocalDate(expense.date);
      const inPeriod = expenseDate >= periodStart && expenseDate <= periodEnd;
      if (!inPeriod) return false;

      // Cadence drilldown: the recurrence IS the filter, categories don't apply.
      if (drilldownContext.recurrence) {
        return (expense.recurrence || 'Never repeat') === drilldownContext.recurrence;
      }

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
  
  const [trendYearFilter, setTrendYearFilter] = useState<number>(savedTrend?.trendYearFilter ?? getMostRecentYearWithData()); // Year filter for Trend tab

  // The breakdown card's view: months, or days of the week. Expenses only -
  // income is payday-dominated (the weekday of the 27th is a calendar
  // accident) and savings is a monthly residual, so for those the picker is
  // not offered and the card stays monthly.
  const [trendBreakdown, setTrendBreakdown] = useState<'monthly' | 'dow'>(savedTrend?.trendBreakdown ?? 'monthly');
  // Day-of-week's own scope: one month of the selected year, or null for all
  // of it. Lives inside the card because it only means anything there.
  const [trendDowMonth, setTrendDowMonth] = useState<number | null>(savedTrend?.trendDowMonth ?? null);
  // Drop recurring rows: rent lands on whichever weekday the 1st falls, which
  // in a single month is one weekday taking the whole hit.
  const [trendDowOneOffs, setTrendDowOneOffs] = useState<boolean>(savedTrend?.trendDowOneOffs ?? false);

  // Trend's own snapshot, same discipline as the overview's below.
  useEffect(() => {
    if (view !== 'trend' || !trendStateRef) return;
    trendStateRef.current = {
      transactionType,
      trendExpandedCategory,
      trendYearFilter,
      selectedCategory,
      selectedSubcategory,
      trendBreakdown,
      trendDowMonth,
      trendDowOneOffs,
    };
  }, [view, trendStateRef, transactionType, trendExpandedCategory, trendYearFilter, selectedCategory, selectedSubcategory, trendBreakdown, trendDowMonth, trendDowOneOffs]);

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

  // Reset recurrence layer when switching transaction type or time period -
  // but not on mount, which would undo the restored layer on every remount and
  // bounce the user out of the breakdown they were reading.
  const recurrenceResetReady = useRef(false);
  useEffect(() => {
    if (!recurrenceResetReady.current) {
      recurrenceResetReady.current = true;
      return;
    }
    setRecurrenceLayer('overview');
    setSelectedRecurrenceSlice(null);
  }, [transactionType, timePeriodType, selectedMonth, selectedQuarter, selectedYear]);

  // Helper function to convert month name to month number (0-11)
  // trendData rows carry the month as its short label, so this must index the
  // SAME array that wrote them (monthsShort) - both run in the same language,
  // a switch remounts everything, and the round-trip stays exact.
  const getMonthNumber = (monthName: string): number => monthsShort().indexOf(monthName);

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

  // A period's absolute position on a single monotonic axis, in the unit of the
  // currently selected period type. Lets a pinned baseline survive navigation.
  const periodIndex = (year: number, month: number, quarter: number) =>
    timePeriodType === 'month' ? year * 12 + month
      : timePeriodType === 'quarter' ? year * 4 + quarter
        : year;
  const currentPeriodIndex = () => periodIndex(selectedYear, selectedMonth, selectedQuarter);

  // How many periods back the chosen baseline sits. A pin that is no longer in
  // the past (the user navigated back past it) falls back to the previous
  // period rather than comparing against the future.
  const resolvedBack = () => {
    if (comparisonBaseline === 'previous' || comparisonBaseline === 'average') return 1;
    const back = currentPeriodIndex() - comparisonBaseline;
    return back >= 1 ? back : 1;
  };

  // The span of one period of the currently selected type, `back` periods
  // before the selected one (0 = the selected period itself).
  const periodRange = (back: number): { start: Date; end: Date } => {
    switch (timePeriodType) {
      case 'month': {
        const m = selectedMonth - back;
        return {
          start: new Date(selectedYear, m, 1),
          end: new Date(selectedYear, m + 1, 0, 23, 59, 59, 999),
        };
      }
      case 'quarter': {
        const qStart = (selectedQuarter - back) * 3;
        return {
          start: new Date(selectedYear, qStart, 1),
          end: new Date(selectedYear, qStart + 3, 0, 23, 59, 59, 999),
        };
      }
      case 'year':
        return {
          start: new Date(selectedYear - back, 0, 1),
          end: new Date(selectedYear - back, 11, 31, 23, 59, 59, 999),
        };
    }
  };

  // The period in progress is only partly spent, so comparing it against a
  // complete earlier one made almost everything look like a fall: on the 8th of
  // the month that is 8 days against 30. Cut the comparison period to the same
  // number of days elapsed so the two halves mean the same thing. A finished
  // period is compared in full. Applies to whichever baseline is chosen -
  // including each period that feeds the average.
  const truncateToElapsed = ({ start, end }: { start: Date; end: Date }) => {
    if (!isAtCurrentPeriod()) return { start, end };
    const day = 24 * 60 * 60 * 1000;
    const elapsed = Math.floor((new Date().getTime() - periodRange(0).start.getTime()) / day);
    const cutoff = new Date(start.getTime() + elapsed * day);
    cutoff.setHours(23, 59, 59, 999);
    return { start, end: cutoff < end ? cutoff : end };
  };

  const inRange = ({ start, end }: { start: Date; end: Date }) =>
    expenses.filter((e) => {
      const d = parseLocalDate(e.date);
      return d >= start && d <= end;
    });

  const ofCurrentType = (list: Expense[]) =>
    transactionType === 'expense'
      ? list.filter((e) => e.type !== 'income')
      : transactionType === 'income'
        ? list.filter((e) => e.type === 'income')
        : list;

  // Short name for a period `back` steps before the selected one - what the
  // dropdown lists and what the column header shows.
  const periodShortLabel = (back: number) => {
    switch (timePeriodType) {
      case 'month': {
        const d = new Date(selectedYear, selectedMonth - back, 1);
        const sameYear = d.getFullYear() === selectedYear;
        return sameYear
          ? monthsShort()[d.getMonth()]
          : `${monthsShort()[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
      }
      case 'quarter': {
        const q = selectedQuarter - back;
        const y = selectedYear + Math.floor(q / 4);
        const qi = ((q % 4) + 4) % 4;
        return `Q${qi + 1}${y !== selectedYear ? ` ${y}` : ''}`;
      }
      case 'year':
        return String(selectedYear - back);
    }
  };

  // Every period before the selected one that actually holds something to
  // compare against, nearest first. A period with no transactions of the type
  // on screen is left out - offering it would only ever answer "New".
  // The dropdown has room the column header does not, so periods are spelled
  // out there - and always carry their year, since the list runs back past
  // January and "June" alone stops being an answer once there are two of them.
  const periodLongLabel = (back: number) => {
    switch (timePeriodType) {
      case 'month': {
        const d = new Date(selectedYear, selectedMonth - back, 1);
        return `${monthsFull()[d.getMonth()]} ${d.getFullYear()}`;
      }
      case 'quarter': {
        const q = selectedQuarter - back;
        const y = selectedYear + Math.floor(q / 4);
        return `Q${(((q % 4) + 4) % 4) + 1} ${y}`;
      }
      case 'year':
        return String(selectedYear - back);
    }
  };

  // Walked backwards - that is how it knows where to stop - then flipped, so
  // the list reads oldest first and runs forward to the period just before the
  // one on screen. Chronological throughout, including across year boundaries;
  // nothing is ever sorted by name.
  const priorPeriods = () => {
    const out: { back: number; index: number; label: string }[] = [];
    const earliest = earliestTransactionDate();
    for (let back = 1; back <= 60; back++) {
      const range = periodRange(back);
      if (earliest && range.end < earliest) break;
      if (ofCurrentType(inRange(range)).length > 0) {
        out.push({ back, index: currentPeriodIndex() - back, label: periodLongLabel(back) });
      }
    }
    return out.reverse();
  };

  // Oldest transaction on record - the point past which there is nothing left
  // to offer as a comparison.
  const earliestTransactionDate = () => {
    let earliest: Date | null = null;
    for (const e of expenses) {
      const d = parseLocalDate(e.date);
      if (!earliest || d < earliest) earliest = d;
    }
    return earliest;
  };

  // What the period picker offers. One pass over the ledger marks the months
  // that hold something, so the sheet can point at where the data actually is
  // rather than presenting twelve identical squares.
  const activeMonths = useMemo(() => {
    const months = new Set<string>();
    for (const e of expenses) {
      const d = parseLocalDate(e.date);
      months.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    return months;
  }, [expenses]);

  const selectableYears = useMemo(() => {
    const nowY = new Date().getFullYear();
    let earliest = nowY;
    for (const key of activeMonths) {
      const y = Number(key.slice(0, key.indexOf('-')));
      if (y < earliest) earliest = y;
    }
    // Never later than this year - the next arrow stops there too - and never
    // later than the year already on screen, which stays reachable even if the
    // transactions that justified it have since been deleted.
    const from = Math.min(earliest, selectedYear, nowY);
    const years: number[] = [];
    for (let y = from; y <= Math.max(nowY, selectedYear); y++) years.push(y);
    return years;
  }, [activeMonths, selectedYear]);

  // Get period display name
  const getPeriodDisplayName = () => {
    switch (timePeriodType) {
      case 'month':
        const date = new Date(selectedYear, selectedMonth, 1);
        return `${monthsFull()[date.getMonth()]} ${date.getFullYear()}`;
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
    if (!isCurrentMonth) return { nudge: false as const, daysLeft: null, monthProgress: null, usualByNow: null };
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const today = now.getDate();

    // What "usual" actually is: the MEDIAN of what this user had spent by this
    // same day of the month, over their previous months (see lib/usual.ts).
    // Time elapsed is a bad stand-in - spending is not linear, and anyone whose
    // rent lands on the 1st would open the app every month morning-one to be
    // told they are "spending faster than usual" when this IS their usual.
    // One number off the same median curve the chart draws, so the bar's
    // verdict and the chart's dotted line can never disagree.
    const usualByNow = (() => {
      const curve = usualCurve(expenses, currency, {
        type: 'month', year: selectedYear, month: selectedMonth, quarter: 0, steps: daysInMonth,
      });
      return curve ? curve[Math.min(today, daysInMonth) - 1] : null;
    })();

    return {
      nudge: false as const,
      daysLeft: daysInMonth - today,
      monthProgress: today / daysInMonth,
      usualByNow,
    };
  })();

  // One line under the hero, and only for the case that genuinely misleads:
  // the month is running, nothing has come in yet, so savings reads as a large
  // loss when it is really just the calendar. Says when income has landed
  // before - a fact about the user's own history, never a prediction about
  // this month. Silent the rest of the time: on a settled month a negative
  // figure is true, and restating it would only make the card bigger.
  // A completed period gets a plain-language summary of how it compared with
  // the user's own baseline, in at most two lines under the hero card.
  //
  // Every line stands on its own. An earlier draft opened with "1,528EUR above
  // your usual" and then said "almost all of it Shopping" - fine together, but
  // the first line was cut for months (the budget bar already says the month
  // was expensive) and "all of what?" was left dangling. So each line now names
  // its own reference point.
  const periodSummary = React.useMemo(() => {
    // A running period is still changing; there is nothing to summarise yet.
    if (isAtCurrentPeriod()) return null;

    const expensesOnly = (list: Expense[]) => list.filter((e) => e.type !== 'income');
    const inPeriod = (back: number) => expensesOnly(inRange(periodRange(back)));
    const totalOf = (back: number) => inPeriod(back).reduce((sum, e) => sum + homeAmount(e, currency), 0);
    const catOf = (back: number, name: string) =>
      inPeriod(back).filter((e) => e.category.name === name).reduce((sum, e) => sum + homeAmount(e, currency), 0);

    // Up to six earlier periods that actually hold data. Fewer than three and
    // "your usual" is a claim the data cannot support.
    const priors: number[] = [];
    for (let back = 1; back <= 12 && priors.length < 6; back++) {
      if (inPeriod(back).length > 0) priors.push(back);
    }
    const spent = totalOf(0);
    if (spent === 0) return null;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // The sentences are assembled per language rather than looked up: Italian
    // needs different word order, prepositions and no verb agreement gambles
    // (category names have grammatical gender the code cannot know). The
    // BRANCHING - which shape fires when - is shared; only phrasing differs.
    const IT = getLanguage() === 'it';
    const unitName = timePeriodType === 'month' ? 'month' : timePeriodType === 'quarter' ? 'quarter' : 'year';
    const unitIt = timePeriodType === 'month' ? 'mese' : timePeriodType === 'quarter' ? 'trimestre' : 'anno';
    // "a month" / "al mese" - the per-period phrase in "your usual X a month".
    const perUnit = IT
      ? (timePeriodType === 'month' ? 'al mese' : timePeriodType === 'quarter' ? 'a trimestre' : "all'anno")
      : `a ${unitName}`;

    // Nothing before it: say so, rather than leaving a blank that looks like a
    // bug. It also explains why later periods start carrying a comparison.
    if (priors.length === 0) {
      const totals = new Map<string, number>();
      for (const e of inPeriod(0)) {
        totals.set(e.category.name, (totals.get(e.category.name) ?? 0) + homeAmount(e, currency));
      }
      const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        line1: IT ? `Il tuo primo ${unitIt} registrato.` : `Your first tracked ${unitName}.`,
        line2: top
          ? `${IT ? 'Categoria più grande' : 'Biggest category'}: ${top[0]}, ${AMOUNT_MARK}${formatAmountListView(top[1], currency, 0)}${AMOUNT_MARK}.`
          : undefined,
      };
    }

    // "Your usual" needs a few periods behind it to be true. With only one or
    // two, compare against the period immediately before and NAME it, so the
    // sentence carries its own reference instead of implying a baseline that
    // does not exist yet. Years are the exception: three would mean the line
    // never appeared until year four.
    const usualMode = priors.length >= (timePeriodType === 'year' ? 2 : 3);
    const baseSet = usualMode ? priors : [priors[0]];
    const base = mean(baseSet.map(totalOf));
    if (base === 0) return null;
    const delta = spent - base;
    const pct = (delta / base) * 100;

    const names = new Set<string>();
    for (const back of [0, ...priors]) for (const e of inPeriod(back)) names.add(e.category.name);
    const movers = [...names]
      .map((name) => {
        const now = catOf(0, name);
        const was = mean(baseSet.map((b) => catOf(b, name)));
        return { name, now, was, delta: now - was };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    // The catch-all is a weak thing to name - "Others moved 605EUR" says a
    // bucket changed without saying what - but suppressing it made the
    // sentence false whenever it genuinely was the driver ("mostly Travel at
    // 365EUR below" when Others had fallen 605EUR). Vague beats wrong, and a
    // user who keeps reading about Others has been told something useful.
    const ups = movers.filter((m) => m.delta > 0);
    const downs = movers.filter((m) => m.delta < 0);

    const money = (v: number) =>
      `${AMOUNT_MARK}${formatAmountListView(Math.abs(v), currency, 0)}${AMOUNT_MARK}`;
    const unit = unitName;

    // How the comparison is worded. Either the user's own baseline, or a named
    // earlier period - never an unqualified number.
    const refLabel = (() => {
      const back = priors[0];
      if (timePeriodType === 'year') return String(selectedYear - back);
      if (timePeriodType === 'quarter') {
        const q = selectedQuarter - back;
        const y = selectedYear + Math.floor(q / 4);
        return `Q${(((q % 4) + 4) % 4) + 1}${y !== selectedYear ? ` ${y}` : ''}`;
      }
      const dte = new Date(selectedYear, selectedMonth - back, 1);
      // Italian lowercases month names mid-sentence ("come a gennaio").
      const m = IT ? monthsFull()[dte.getMonth()].toLowerCase() : monthsFull()[dte.getMonth()];
      return dte.getFullYear() === selectedYear ? m : `${m} ${dte.getFullYear()}`;
    })();
    const aboveRef = IT
      ? (usualMode ? 'sopra il tuo solito' : `in più rispetto a ${refLabel}`)
      : (usualMode ? 'above your usual' : `more than ${refLabel}`);
    const belowRef = IT
      ? (usualMode ? 'sotto il solito' : `in meno rispetto a ${refLabel}`)
      : (usualMode ? 'below usual' : `less than ${refLabel}`);

    // Is this the priciest period on record? Only worth saying when true.
    let record = false;
    if (delta > 0) {
      let maxPrior = 0;
      for (let back = 1; back <= 24; back++) {
        if (inPeriod(back).length > 0) maxPrior = Math.max(maxPrior, totalOf(back));
      }
      record = spent > maxPrior;
    }

    // The shape of the difference, which is the part a total cannot tell you:
    // one category running away with the period reads very differently from
    // every category drifting up at once, and calls for a different response.
    const topSame = (delta > 0 ? ups : downs)[0];
    const share = topSame ? topSame.delta / delta : 0;
    // Named individually, so they have to be worth a reader's attention.
    // A change often lands harder as a proportion than as a sum: "5x January"
    // says more than "+1,477EUR". But a multiple off a small base is theatre -
    // 13x sounds alarming when the usual figure is 52EUR - and off a zero base
    // it means nothing at all, so the form follows the size of what it
    // measures, and the plain sum is always there as the fallback.
    const RELATIVE_FLOOR = 50;
    const relative = (m: { was: number; now: number; delta: number }) => {
      if (m.was < RELATIVE_FLOOR) return null;
      const ratio = m.now / m.was;
      if (ratio >= 2) return `${ratio >= 3 ? Math.round(ratio) : Math.round(ratio * 10) / 10}x`;
      const pct = Math.round(Math.abs(m.delta / m.was) * 100);
      return pct >= 15 ? `${pct}%` : null;
    };
    const refWord = IT ? (usualMode ? 'il solito' : refLabel) : (usualMode ? 'usual' : refLabel);
    // "was 5x usual" / "was 54% below usual" / "ran 1,477EUR more than January".
    // The Italian forms are verbless ("5x il solito") - callers join them with
    // a colon, which sidesteps gender agreement with category names entirely.
    const detail = (m: { name: string; was: number; now: number; delta: number }, withMoney = true) => {
      const rel = relative(m);
      // No usable proportion: the sum is the sentence.
      if (!rel) {
        return IT
          ? `${money(m.delta)} ${m.delta > 0 ? aboveRef : belowRef}`
          : `ran ${money(m.delta)} ${m.delta > 0 ? aboveRef : belowRef}`;
      }
      const core = rel.endsWith('x')
        ? (IT ? `${rel} ${refWord}` : `was ${rel} ${refWord}`)
        : IT
          ? `${rel} ${m.delta > 0 ? 'sopra' : 'sotto'} ${refWord}`
          : `was ${rel} ${m.delta > 0 ? 'above' : 'below'} ${refWord}`;
      // The sum rides along in brackets, because a proportion alone cannot say
      // whether 9x usual is 90EUR or 1,090EUR.
      return withMoney ? `${core} (${m.delta > 0 ? '+' : ''}${money(m.delta)})` : core;
    };
    // One line, always. Prefer the fuller phrasing, drop the bracketed sum when
    // it would push the sentence onto a second row and steal the next line.
    const MAX_LINE = 52;
    // The fences are zero-width, so they do not count towards the line.
    const visibleLength = (s: string) => s.replace(/⁣/g, '').length;
    const fitted = (build: (withMoney: boolean) => string) => {
      const full = build(true);
      return visibleLength(full) <= MAX_LINE ? full : build(false);
    };

    const WORTH_NAMING = 100;
    // The second thing worth saying is simply the next biggest move, in
    // WHICHEVER direction it went. Naming only movers that agree with the net
    // made the summary structurally blind to the opposite case: February came
    // out 999EUR lower than January, so nothing could report that Travel had
    // quadrupled - a 1,477EUR rise, larger than the net gap itself, hidden
    // because a one-off 1,816EUR in Others had not repeated.
    const runnerUp = (exclude?: { name: string }) => {
      const next = movers.find((m) => m.name !== exclude?.name && Math.abs(m.delta) >= WORTH_NAMING);
      if (!next) return undefined;
      // A category that went to zero is best said plainly; "0.0x usual" is not
      // a sentence anyone reads.
      if (next.now === 0 && next.was >= RELATIVE_FLOOR) {
        return IT
          ? `Niente in ${next.name}: ${money(next.delta)} ${belowRef}.`
          : `Nothing in ${next.name}, ${money(next.delta)} ${belowRef}.`;
      }
      return fitted((w) => (IT ? `${next.name}: ${detail(next, w)}.` : `${next.name} ${detail(next, w)}.`));
    };
    const bigUps = ups.filter((m) => m.delta >= Math.max(WORTH_NAMING, Math.abs(delta) * 0.15));
    const bigDowns = downs.filter((m) => Math.abs(m.delta) >= WORTH_NAMING);

    const flat = Math.abs(pct) < 8;
    // Null when there is genuinely nothing to add beyond "this was a normal
    // period" - saying so twice is worse than saying it once.
    let shape: string | null;
    let evidence: string | undefined;
    if (flat) {
      shape = ups[0]
        ? fitted((w) =>
            IT
              ? `Nel complesso stabile, ma ${ups[0].name}: ${detail(ups[0], w)}.`
              : `Steady overall, though ${ups[0].name} ${detail(ups[0], w)}.`,
          )
        : null;
      if (shape) evidence = runnerUp(ups[0]);
    } else if (delta < 0) {
      shape = !topSame
        ? IT
          ? `Più tranquillo ${usualMode ? 'del solito' : `di ${refLabel}`}: ${money(delta)} in meno.`
          : `Quieter ${usualMode ? 'than usual' : `than ${refLabel}`}, ${money(delta)} below.`
        : topSame.now === 0 && topSame.was >= RELATIVE_FLOOR
          ? IT
            ? `Niente in ${topSame.name}: ${money(topSame.delta)} ${belowRef}.`
            : `Nothing in ${topSame.name}, ${money(topSame.delta)} ${belowRef}.`
          : fitted((w) =>
              IT
                ? `${topSame.name} ha tirato giù il ${unitIt}: ${detail(topSame, w)}.`
                : `${topSame.name} pulled the ${unit} down, ${detail(topSame, w).replace(/^(was|ran) /, '')}.`,
            );
      evidence = runnerUp(topSame);
    } else if (share >= 0.6 && topSame) {
      shape = fitted((w) =>
        IT
          ? `${topSame.name} ha trainato il ${unitIt}: ${detail(topSame, w)}.`
          : `${topSame.name} drove the ${unit}, ${detail(topSame, w).replace(/^(was|ran) /, '')}.`,
      );
      evidence = runnerUp(topSame);
    } else {
      // Deliberately no count. A count would have to be of categories above
      // some threshold, while the sentence reads as "all of them" - eight rose
      // in July, four by an amount worth reading. The shape is the point.
      shape = IT
        ? usualMode
          ? `Più alto del solito in diverse categorie:`
          : `Più alto rispetto a ${refLabel} in diverse categorie:`
        : usualMode
          ? `Higher than usual across several categories:`
          : `Higher than ${refLabel} across several categories:`;
      evidence = bigUps.slice(0, 3).map((m) => `${m.name} +${money(m.delta)}`).join(', ') + '.';
    }

    const inLine = IT
      ? usualMode
        ? `In linea con il tuo solito: ${money(base)} ${perUnit}.`
        : `Più o meno come ${refLabel}: ${money(base)}.`
      : usualMode
        ? `In line with your usual ${money(base)} a ${unit}.`
        : `Much the same as ${refLabel}, ${money(base)}.`;
    if (timePeriodType === 'month') {
      // No leading comparison: the budget bar below already reports the month
      // against its limit, and repeating the idea costs a line.
      return {
        line1: shape ?? inLine,
        line2: evidence ?? (record ? (IT ? `Il tuo ${unitIt} più caro finora.` : `Your most expensive ${unit} so far.`) : undefined),
      };
    }
    // Quarters and years have no budget bar, so they keep the comparison. A
    // flat period says so once rather than reporting itself as "0EUR below".
    return {
      line1: flat
        ? inLine
        : IT
          ? usualMode
            ? `${money(delta)} ${delta > 0 ? 'sopra' : 'sotto'} il tuo solito di ${money(base)} ${perUnit}.`
            : `${money(delta)} ${delta > 0 ? 'in più' : 'in meno'} rispetto a ${refLabel} (${money(base)}).`
          : usualMode
            ? `${money(delta)} ${delta > 0 ? 'above' : 'below'} your usual ${money(base)} a ${unit}.`
            : `${money(delta)} ${delta > 0 ? 'more' : 'less'} than ${refLabel}, which was ${money(base)}.`,
      line2: shape ?? undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, currency, timePeriodType, selectedMonth, selectedQuarter, selectedYear]);

  const heroNote = (() => {
    if (timePeriodType !== 'month' || !isAtCurrentPeriod()) return null;
    if (totalIncome !== 0 || savings >= 0) return null;
    const periodStart = new Date(selectedYear, selectedMonth, 1);
    const days = expenses
      .filter((t) => t.type === 'income' && parseLocalDate(t.date) < periodStart)
      .map((t) => Number(t.date.slice(8, 10)))
      .sort((a, b) => a - b);
    if (days.length === 0) {
      return getLanguage() === 'it'
        ? 'Nessuna entrata registrata questo mese.'
        : 'No income recorded yet this month.';
    }
    const day = days[Math.floor(days.length / 2)]; // median: robust to one odd month
    const ord = (n: number) =>
      `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
    return getLanguage() === 'it'
      ? `Le entrate di solito arrivano intorno al ${day}.`
      : `Income usually lands around the ${ord(day)}.`;
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
  const formatRowAmount = (amount: number) => (
    <AmountText
      amount={amount}
      currency={currency}
      decimals={0}
      abbreviate={abbreviateRowAmounts ? 'fit' : undefined}
    />
  );

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

  // Calculate trend for categories and subcategories.
  //
  // 'new' and 'neutral' used to be the same answer, which made a category you
  // had never spent on look identical to one that matched last month exactly -
  // and left a first-time user with a column of dashes, since on their first
  // month everything is new.
  // What one category (or subcategory) came to over a single earlier period.
  // `truncate` false measures the WHOLE baseline period rather than the slice
  // matching the days elapsed - used to ask "did this category exist at all
  // back then", which is a question about existence, not about pace.
  const amountInPeriod = (
    back: number,
    categoryName: string,
    subcategoryName?: string,
    truncate = true,
  ) => {
    const range = truncate ? truncateToElapsed(periodRange(back)) : periodRange(back);
    return ofCurrentType(inRange(range))
      .filter((e) =>
        e.category.name === categoryName &&
        (subcategoryName === undefined || e.subcategory === subcategoryName)
      )
      .reduce((sum, e) => sum + homeAmount(e, currency), 0);
  };

  // The number the trend column measures against, per the chosen baseline.
  //
  // 'average' divides by every prior period that holds data - not just the ones
  // this category appeared in. A category bought once in eight months is not
  // running at that month's rate, and dividing by 1 would claim it is.
  const baselineAmount = (categoryName: string, subcategoryName?: string, truncate = true): number => {
    if (comparisonBaseline === 'average') {
      const periods = priorPeriods();
      if (periods.length === 0) return 0;
      const total = periods.reduce(
        (sum, p) => sum + amountInPeriod(p.back, categoryName, subcategoryName, truncate),
        0,
      );
      return total / periods.length;
    }
    return amountInPeriod(resolvedBack(), categoryName, subcategoryName, truncate);
  };

  const calculateTrend = (
    categoryName: string,
    subcategoryName?: string,
  ): 'up' | 'down' | 'neutral' | 'new' => {
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

    let previousAmount = baselineAmount(categoryName, subcategoryName);
    // Measured over the whole baseline period, ignoring the pace window.
    const previousEver = baselineAmount(categoryName, subcategoryName, false);

    // "New" is a claim about ever having spent here, so it is answered by the
    // WHOLE baseline period. Answering it from the pace-matched slice made the
    // first days of a month absurd: on the 1st that slice is a single day, so
    // every category whose spending had not happened to land on the 1st last
    // month was announced as new - Travel read "New" in August against a
    // 1,460EUR July.
    if (previousEver === 0) {
      return currentAmount === 0 ? 'neutral' : 'new';
    }
    // The pace window can be empty by accident. On the 2nd it is a two-day
    // sample of one month, and three of the last six months here held nothing
    // in Food & Drinks by then - so 174EUR against a July that totalled 186EUR
    // was reported as flat. "Flat" is a positive claim, and it was false.
    //
    // A zero baseline is not evidence of anything, so fall back to what this
    // category usually costs by this day, averaged across recent months. That
    // is the same measure the budget bar uses, and unlike a single month it is
    // not hostage to whether one particular week happened to be quiet. It also
    // keeps small amounts honest: a 5EUR coffee against a usual 20EUR reads
    // down, where a bare "something against nothing" would have shouted up.
    if (previousAmount === 0) {
      const periods = priorPeriods();
      const usual = periods.length
        ? periods.reduce((sum, p) => sum + amountInPeriod(p.back, categoryName, subcategoryName), 0) / periods.length
        : 0;
      // Nothing has ever been spent here this early in a month, and something
      // has been now: that genuinely is a rise, with nothing to size it by.
      if (usual === 0) return currentAmount > 0 ? 'up' : 'neutral';
      previousAmount = usual;
    }

    // Calculate percentage change (5% threshold to avoid showing trend for tiny changes)
    const percentageChange = ((currentAmount - previousAmount) / previousAmount) * 100;

    if (Math.abs(percentageChange) < 5) {
      return 'neutral';
    }

    return currentAmount > previousAmount ? 'up' : 'down';
  };

  // What the arrows are measured against, for the label above the last column.
  // Kept as short as it can be said: the shorter it is, the more it reads as a
  // heading for that one column rather than a note about the whole card.
  //
  // No "so far" qualifier on a period in progress. It was there to admit the
  // comparison was lopsided; now that the previous period is cut to the same
  // number of days elapsed, "vs. Jun" is simply true.
  const comparisonLabel = () =>
    comparisonBaseline === 'average' ? t('cat.vsAvg') : `vs. ${periodShortLabel(resolvedBack())}`;

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
          month: monthsShort()[monthStart.getMonth()],
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
        month: monthsShort()[monthStart.getMonth()],
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
      const monthNames = monthsShort();
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
          name: source?.name || t('src.noSource'),
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
    if (hour < 12) return t('greeting.morning');
    if (hour < 18) return t('greeting.afternoon');
    if (hour < 23) return t('greeting.evening');
    return t('greeting.night');
  };

  const greeting = userName ? `${getGreeting()}, ${userName}` : t('greeting.welcome');

  // Slice names in the recurrence breakdown are canonical data ('One-off',
  // 'Recurring', then rule strings like 'Every month') - comparisons and the
  // drilldown filter depend on them - so only the rendering translates.
  const recurrenceSliceLabel = (name: string) =>
    name === 'One-off' ? t('rec.oneOff') : name === 'Recurring' ? t('rec.recurring') : translateRecurrence(name);

  // First run: an empty ledger used to render a page of zeros with no hint of
  // what to do next - the wall every brand-new user hit right after the tour.
  // One clear action instead (plus the sample-data shortcut for people who
  // want to see the app alive before committing anything).
  if (view === 'overview' && expenses.length === 0) {
    return (
      // Not min-h-screen: the tab wrapper already adds the top inset and a
      // pb-32 that clears the nav bar, so a full-viewport child overflows by
      // exactly that chrome and the page scrolls onto nothing. Undershoot
      // instead and let justify-center place the card.
      <div className="flex flex-col" style={{ backgroundColor: '#F6F5F2', minHeight: 'calc(100dvh - 200px)' }}>
        <div className="px-6 pt-1">
          <p style={{ color: '#8E8E93', fontSize: '14px', marginBottom: '2px' }}>{greeting}</p>
          <h1 style={{ color: '#1C1C1E', fontSize: '28px', fontWeight: '600', letterSpacing: '-0.5px' }}>
            Dashboard
          </h1>
        </div>
        <div className="flex-1 flex flex-col justify-center px-6 pt-4 pb-4">
          <div className="rounded-2xl px-6 py-8 text-center" style={{ background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', border: '1px solid #EEEEF1' }}>
            <div className="mx-auto mb-4 flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 999, background: '#EFF6FF' }}>
              <Plus className="w-7 h-7" style={{ color: '#3B82F6' }} strokeWidth={2.5} />
            </div>
            <h2 style={{ color: '#1C1C1E', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>
              {t('dash.empty.title')}
            </h2>
            <p style={{ color: '#8E8E93', fontSize: 15, lineHeight: 1.45, marginBottom: 20 }}>
              {t('dash.empty.body')}
            </p>
            {onAddFirstExpense && (
              <button
                onClick={onAddFirstExpense}
                className="w-full py-4 rounded-xl font-medium text-base transition-all active:scale-[0.98]"
                style={{ backgroundColor: '#3B82F6', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
              >
                {t('dash.empty.cta')}
              </button>
            )}
            {onLoadDemoData && (
              <button onClick={onLoadDemoData} className="w-full py-3 mt-1 text-[14px] font-medium" style={{ color: '#8E8E93' }}>
                {t('dash.empty.demo')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F6F5F2' }}>
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
            {/* One pill, not a labelled field: "Period: Month" said the same
                thing twice, and the value alone reads as what it is. */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
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
                    // Change the lens, stay where you are. This used to jump
                    // back to today, so looking at October 2025 by quarter
                    // landed on the CURRENT quarter and you had to navigate all
                    // the way back. The title picker is how you move; this only
                    // changes how the period in view is cut up.
                    //
                    // Zooming in lands on the last sub-period in view, never
                    // later than today: 2025 by month is December 2025, but
                    // this year by month is this month, not December.
                    const now = new Date();
                    const lastMonthInView =
                      timePeriodType === 'month' ? selectedMonth
                      : timePeriodType === 'quarter' ? selectedQuarter * 3 + 2
                      : 11;
                    const month =
                      selectedYear === now.getFullYear()
                        ? Math.min(lastMonthInView, now.getMonth())
                        : lastMonthInView;
                    setSelectedMonth(month);
                    setSelectedQuarter(Math.floor(month / 3));
                    setExpandedCategory(null);
                    // A pinned index is counted in the old unit; it would point
                    // at an unrelated period under the new one.
                    setComparisonBaseline('previous');
                  }}
                  className="pl-3 pr-7 py-1.5 rounded-full text-xs font-medium text-neutral-600 border border-neutral-200"
                  style={{
                    WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'manipulation',
                    backgroundColor: '#FFFFFF',
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
                  <option value="month">{t('dash.periodType.month')}</option>
                  <option value="quarter">{t('dash.periodType.quarter')}</option>
                  <option value="year">{t('dash.periodType.year')}</option>
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
              className="overflow-hidden"
              style={{
                // A corner reads relative to the box it turns: 16px on a
                // surface this size looks clipped, where the same 16px is
                // generous on the cards below. Matching the radius to the
                // surface keeps the apparent curvature even and puts the hero
                // where it belongs in the hierarchy.
                borderRadius: 24,
                background: 'radial-gradient(120% 120% at 90% -20%, rgba(99,102,241,0.30) 0%, rgba(59,130,246,0.12) 42%, rgba(28,28,30,0) 68%), radial-gradient(100% 100% at 6% 118%, rgba(59,130,246,0.10) 0%, rgba(99,102,241,0.04) 45%, rgba(28,28,30,0) 72%), linear-gradient(150deg, #2E2E32 0%, #1C1C1E 100%)',
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

                  {/* The title is the way in to any other period. Stepping the
                      arrows from here to October 2025 was eleven taps. */}
                  <button
                    onClick={() => setIsPeriodPickerOpen(true)}
                    className="flex items-center justify-center gap-1 flex-1 min-w-0 py-1 rounded-lg"
                    style={{ WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)' }}
                    aria-label={`${monthName} - choose a period`}
                  >
                    <span className="font-semibold text-sm truncate" style={{ color: '#FFFFFF' }}>
                      {monthName}
                    </span>
                    <ChevronDown className="w-2.5 h-2.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.55)' }} strokeWidth={3} />
                  </button>

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
                        <div className="text-[11px] leading-tight mb-1" style={{ color: 'rgba(235,235,245,0.6)' }}>{t('dash.spending')}</div>
                        <FitText
                          max={17}
                          min={14}
                          compact={formatAbbreviatedAmount(totalSpending, currency)}
                          compactNode={<AmountText amount={totalSpending} currency={currency} decimals={0} abbreviate="fit" />}
                          className="font-bold leading-none tabular-nums"
                          style={{ color: '#FFFFFF' }}
                        >
                          <AmountText amount={totalSpending} currency={currency} decimals={0} />
                        </FitText>
                      </div>
                    </div>
                    <div className="w-px self-stretch mx-3" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(48,209,88,0.16)' }}>
                        <Plus className="w-4 h-4" style={{ color: '#30D158' }} strokeWidth={3} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] leading-tight mb-1" style={{ color: 'rgba(235,235,245,0.6)' }}>{t('dash.income')}</div>
                        <FitText
                          max={17}
                          min={14}
                          compact={formatAbbreviatedAmount(totalIncome, currency)}
                          compactNode={<AmountText amount={totalIncome} currency={currency} decimals={0} abbreviate="fit" />}
                          className="font-bold leading-none tabular-nums"
                          style={{ color: '#FFFFFF' }}
                        >
                          <AmountText amount={totalIncome} currency={currency} decimals={0} />
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
                        <div className="text-[11px] leading-tight mb-1" style={{ color: 'rgba(235,235,245,0.6)' }}>{t('dash.savings')}</div>
                        <FitText
                          max={17}
                          min={14}
                          compact={formatAbbreviatedAmount(savings, currency)}
                          compactNode={<AmountText amount={savings} currency={currency} decimals={0} abbreviate="fit" />}
                          className="font-bold leading-none tabular-nums"
                          style={{ color: savings < 0 ? '#FF6961' : savings > 0 ? '#30D158' : '#FFFFFF' }}
                        >
                          <AmountText amount={savings} currency={currency} decimals={0} />
                        </FitText>
                      </div>
                    </div>
                    <div className="w-px self-stretch mx-3" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(100,160,255,0.16)' }}>
                        <Gauge className="w-4 h-4" style={{ color: '#64A0FF' }} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] leading-tight mb-1" style={{ color: 'rgba(235,235,245,0.6)' }}>{t('dash.savingRate')}</div>
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

                  {/* A running period explains itself; a finished one gets
                      summarised. The two can never both apply. */}
                  {(heroNote || periodSummary) && (
                    <>
                      <div className="h-px mt-3" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
                      <div className="pt-2.5" style={{ color: 'rgba(235,235,245,0.6)' }}>
                        {heroNote ? (
                          // Structurally one line: truncate rather than wrap.
                          <div className="text-[11px] leading-snug truncate">{heroNote}</div>
                        ) : (
                          <>
                            <div className="text-[11px] leading-snug">
                              <InsightLine text={periodSummary!.line1} />
                            </div>
                            {periodSummary!.line2 && (
                              <div className="text-[11px] leading-snug mt-0.5" style={{ color: 'rgba(235,235,245,0.45)' }}>
                                <InsightLine text={periodSummary!.line2} />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Type Selector */}
          <div className="px-6 mb-4">
            {/* One thumb that slides, rather than two boxes that light up: the
                filled half used to read as a washed-out error banner. The
                active label keeps its meaning-colour, so which side you are on
                is still legible at a glance. */}
            <div className="relative flex p-1 rounded-full" style={{ backgroundColor: '#ECEAE4' }}>
              <div
                className="absolute rounded-full"
                style={{
                  top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                  transform: transactionType === 'income' ? 'translateX(100%)' : 'translateX(0)',
                  transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
                aria-hidden="true"
              />
              <button
                onClick={() => setTransactionType('expense')}
                className="relative flex-1 py-1.5 text-sm font-medium transition-colors"
                style={{ color: transactionType === 'expense' ? '#C2352B' : '#8E8E93' }}
              >
                {t('seg.expenses')}
              </button>
              <button
                onClick={() => setTransactionType('income')}
                className="relative flex-1 py-1.5 text-sm font-medium transition-colors"
                style={{ color: transactionType === 'income' ? '#1F7A43' : '#8E8E93' }}
              >
                {t('seg.income')}
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
              usualByNow={budgetView.usualByNow}
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
                  {/* Sort belongs with the heading - it acts on the whole list.
                      The comparison label does not: it describes the last
                      column and nothing else, so it sits right-aligned above
                      that column, like the column headers in Trend. */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <h2 style={{ color: '#1C1C1E', fontWeight: '600' }}>{t('cat.title')}</h2>
                    <button
                      onClick={() => setCategorySortBy(categorySortBy === 'alphabetical' ? 'amount' : 'alphabetical')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
                      style={{ backgroundColor: '#F2F1ED' }}
                      aria-label="Toggle sort order"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />
                      <span className="text-xs" style={{ color: '#8E8E93' }}>
                        {categorySortBy === 'alphabetical' ? 'A-Z' : '€'}
                      </span>
                    </button>
                  </div>
                  {/* The baseline the trend column measures against. Left as
                      plain text until there is genuinely something to choose -
                      a chevron on a one-option menu is just noise. */}
                  {(() => {
                    const priors = priorPeriods();
                    if (priors.length === 0) {
                      return (
                        <span
                          className="text-[10px] whitespace-nowrap text-right flex-shrink-0"
                          style={{ color: '#A0A0A8' }}
                        >
                          {comparisonLabel()}
                        </span>
                      );
                    }
                    const value =
                      comparisonBaseline === 'average'
                        ? 'average'
                        : String(currentPeriodIndex() - resolvedBack());
                    return (
                      <div className="relative flex items-center gap-0.5 flex-shrink-0">
                        <span
                          className="text-[10px] whitespace-nowrap text-right"
                          style={{ color: '#A0A0A8' }}
                        >
                          {comparisonLabel()}
                        </span>
                        <ChevronDown className="w-2.5 h-2.5" style={{ color: '#C7C7CC' }} strokeWidth={2.5} />
                        <select
                          aria-label="Compare against"
                          value={value}
                          onChange={(e) =>
                            setComparisonBaseline(
                              e.target.value === 'average' ? 'average' : Number(e.target.value)
                            )
                          }
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          style={{
                            WebkitTapHighlightColor: 'rgba(255,255,255,0)',
                            WebkitAppearance: 'none',
                            appearance: 'none',
                            touchAction: 'manipulation',
                            transform: 'translateZ(0)',
                          }}
                        >
                          {priors.map((p) => (
                            <option key={p.index} value={String(p.index)}>
                              {p.label}
                            </option>
                          ))}
                          <option value="average">{t('cat.average')}</option>
                        </select>
                      </div>
                    );
                  })()}
                </div>
                {sortedCategories.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-neutral-400 text-sm mb-1">
                      {transactionType === 'expense' ? t('cat.emptyExpenses') : t('cat.emptyIncome')}
                    </div>
                    <p className="text-neutral-500 text-xs">
                      {transactionType === 'expense' ? t('cat.emptyHintExpenses') : t('cat.emptyHintIncome')}
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
                                {/* The bar in the category's own colour, stepped
                                    back: the pastel bg class it used was near-
                                    invisible against the track and read as an
                                    underline artifact. */}
                                {!isExpanded && (
                                  <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0, 0, 0, 0.06)' }}>
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${item.percentage}%`, backgroundColor: categoryHex(item.category.color), opacity: 0.45 }}
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
                              <div className="w-8 flex items-center justify-center ml-1.5">
                                {trend === 'up' && (
                                  <TrendingUp className="w-3.5 h-3.5" style={{ color: transactionType === 'expense' ? '#FF3B30' : '#34C759', strokeWidth: 2.5 }} />
                                )}
                                {trend === 'down' && (
                                  <TrendingDown className="w-3.5 h-3.5" style={{ color: transactionType === 'expense' ? '#34C759' : '#FF3B30', strokeWidth: 2.5 }} />
                                )}
                                {trend === 'neutral' && (
                                  <Minus className="w-3.5 h-3.5" style={{ color: '#8E8E93', strokeWidth: 2.5 }} />
                                )}
                                {/* A word rather than another arrow: nothing went up or
                                    down, there simply is no earlier figure. */}
                                {trend === 'new' && (
                                  <span className="text-[9px] font-semibold" style={{ color: '#6B6B75' }}>{t('cat.new')}</span>
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
                                    // pr-0, not px-1: the left padding gives the
                                    // label clearance from the vertical rule, but
                                    // padding on the right would inset the figures
                                    // 4px from the parent row's, which is visible
                                    // as soon as the two are stacked.
                                    className="flex items-center justify-between gap-3 py-1 w-full text-left active:bg-neutral-100 rounded-md pl-1 pr-0 transition-colors"
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
                                      <div className="w-8 flex items-center justify-center ml-1.5">
                                        {subTrend === 'up' && (
                                          <TrendingUp className="w-3 h-3" style={{ color: transactionType === 'expense' ? '#FF3B30' : '#34C759', strokeWidth: 2.5 }} />
                                        )}
                                        {subTrend === 'down' && (
                                          <TrendingDown className="w-3 h-3" style={{ color: transactionType === 'expense' ? '#34C759' : '#FF3B30', strokeWidth: 2.5 }} />
                                        )}
                                        {subTrend === 'neutral' && (
                                          <Minus className="w-3 h-3" style={{ color: '#8E8E93', strokeWidth: 2.5 }} />
                                        )}
                                        {subTrend === 'new' && (
                                          <span className="text-[8px] font-semibold" style={{ color: '#6B6B75' }}>{t('cat.new')}</span>
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
                                  className="flex items-center justify-between gap-3 py-1 w-full text-left active:bg-neutral-100 rounded-md pl-1 pr-0 transition-colors"
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
                                      {formatRowAmount(extras.otherAmount)}
                                    </div>
                                    {/* Empty, but the same width as the trend
                                        column on every other row - otherwise
                                        this row's figures sit out of line with
                                        the named subcategories above it. */}
                                    <div className="w-8 ml-1.5" />
                                  </div>
                                </button>
                              )}

                              {/* See every transaction in the category at once */}
                              <button
                                onClick={() => setDrilldownContext({ categoryName: item.name, subcategoryName: null })}
                                className="flex items-center gap-1 py-1.5 w-full text-left active:bg-neutral-100 rounded-md px-1 transition-colors"
                              >
                                <span className="text-[11px] font-medium" style={{ color: '#3B82F6' }}>
                                  View all {extras.totalCount} transactions
                                </span>
                                <ChevronRight className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
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
            // The benchmark: the median of earlier periods, aligned step for
            // step. Spans the WHOLE period while the solid line stops at
            // today, so a running month shows where "usual" is heading.
            const periodWord =
              timePeriodType === 'month' ? t('chart.thisMonth')
              : timePeriodType === 'quarter' ? t('chart.thisQuarter')
              : t('chart.thisYear');
            const usual = usualCurve(expenses, currency, {
              type: timePeriodType,
              year: selectedYear,
              month: selectedMonth,
              quarter: selectedQuarter,
              steps: cumulativeData.length,
            });

            // The other benchmark on offer: this same period, one year back.
            const lastYear = periodCurve(expenses, currency, {
              type: timePeriodType,
              year: selectedYear - 1,
              month: selectedMonth,
              quarter: selectedQuarter,
              steps: cumulativeData.length,
            });
            // The user's choice, downgraded to whatever actually exists - a
            // remembered "last year" must not blank the line on a month whose
            // previous year has no data.
            const benchmarkMode: 'usual' | 'lastYear' =
              cumulativeBenchmark === 'lastYear'
                ? (lastYear ? 'lastYear' : 'usual')
                : (usual ? 'usual' : lastYear ? 'lastYear' : 'usual');
            const benchCurve = benchmarkMode === 'lastYear' ? lastYear : usual;
            const M3 = monthsShort();
            const lastYearLabel =
              timePeriodType === 'month' ? `${M3[selectedMonth]} ${selectedYear - 1}`
              : timePeriodType === 'quarter' ? `Q${selectedQuarter + 1} ${selectedYear - 1}`
              : `${selectedYear - 1}`;
            const benchmarkLabel = benchmarkMode === 'lastYear' ? lastYearLabel : t('chart.yourUsual');
            const benchmarkChoices = !!usual && !!lastYear;

            // ONE projection, shared by the SVG, the pointer handlers and the
            // tooltip. This used to be three copies of the same arithmetic and
            // they drifted apart: the handlers still assumed a 200px-tall chart
            // and an axis scaled to the spending line alone, so once the
            // benchmark (which is often the taller of the two) set the axis,
            // the marker landed hundreds of euros above the point it named.
            const geom = (() => {
              const svgW = chartWidth || 340;
              const svgH = benchCurve ? 178 : 200;
              const marginTop = 5;
              const marginRight = 10;
              const marginBottom = 35; // room for x-axis labels
              const marginLeft = 40; // y-axis label column
              const plotW = svgW - marginLeft - marginRight;
              const plotH = svgH - marginTop - marginBottom;
              const n = cumulativeData.length;
              const dataMax = Math.max(
                ...cumulativeData.map((d) => d.cumulative ?? 0),
                ...(benchCurve ?? []),
                1,
              );
              const { max: axisMax, step: yStep } = niceAxis(dataMax);
              return {
                svgW, svgH, marginTop, marginRight, marginBottom, marginLeft,
                plotW, plotH, n, axisMax, yStep,
                xOf: (i: number) => marginLeft + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2),
                yOf: (v: number) => marginTop + plotH * (1 - v / axisMax),
                // Which point a finger at this x means. The slack either side
                // keeps the first and last days reachable without pixel-perfect
                // aim.
                indexAt: (px: number) => {
                  const rel = px - marginLeft;
                  if (rel < -10 || rel > plotW + 10) return null;
                  return Math.max(0, Math.min(Math.round((rel / plotW) * (n - 1)), n - 1));
                },
              };
            })();
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
            
            // One handler for finger and mouse: the touch version was written
            // separately and then never bound to anything, so dragging along
            // the chart did nothing on a phone and only Safari's synthetic
            // click ever reached it.
            const showTooltipAt = (clientX: number, el: HTMLElement) => {
              const rect = el.getBoundingClientRect();
              const i = geom.indexAt(clientX - rect.left);
              if (i === null) return;
              const point = cumulativeData[i];
              if (!point) return;

              const actual = point.cumulative;
              const benchmark = benchCurve ? benchCurve[i] : null;
              // Past today in a running period there is no spending yet, but
              // there IS a benchmark - and "where would I usually be by the
              // 20th" is exactly what that line is for.
              if (actual === null && benchmark === null) return;

              let periodLabel = point.label;
              if (timePeriodType === 'month') {
                const day = parseInt(point.label);
                const date = new Date(selectedYear, selectedMonth, day);
                const getOrdinal = (nn: number) => {
                  const suf = ['th', 'st', 'nd', 'rd'];
                  const v = nn % 100;
                  return nn + (suf[(v - 20) % 10] || suf[v] || suf[0]);
                };
                // Ordinals are an English habit; Italian dates are plain
                // numbers, day first.
                periodLabel = getLanguage() === 'it'
                  ? `${daysShort()[date.getDay()]} ${day} ${monthsShort()[selectedMonth]}`
                  : `${daysShort()[date.getDay()]}, ${monthsShort()[selectedMonth]} ${getOrdinal(day)}`;
              } else if (timePeriodType === 'year') {
                // The x-axis shows just the month initial when zoomed to a year;
                // spell it out fully in the tooltip where there's room.
                periodLabel = `${monthsFull()[i]} ${selectedYear}`;
              }

              setTooltipData({
                x: geom.xOf(i),
                y: geom.yOf(actual ?? (benchmark as number)),
                label: periodLabel,
                value: actual,
                usual: benchmark,
                usualY: benchmark === null ? null : geom.yOf(benchmark),
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
                      {t('chart.cumulative')}
                    </h3>
                    <div
                      ref={chartBoxRef}
                      style={{
                        height: benchCurve ? '178px' : '200px',
                        width: '100%',
                        position: 'relative',
                        minWidth: 0,
                        minHeight: 0,
                        // The scrub gesture is horizontal; let the page keep the
                        // vertical one so the card never traps the scroll.
                        touchAction: 'pan-y',
                      }}
                      onMouseMove={(e) => showTooltipAt(e.clientX, e.currentTarget)}
                      onMouseLeave={() => setTooltipData(null)}
                      onTouchStart={(e) => { const t = e.touches[0]; if (t) showTooltipAt(t.clientX, e.currentTarget); }}
                      onTouchMove={(e) => { const t = e.touches[0]; if (t) showTooltipAt(t.clientX, e.currentTarget); }}
                      onTouchEnd={() => setTooltipData(null)}
                      onTouchCancel={() => setTooltipData(null)}
                    >
                      {/* Custom SVG area chart — no recharts to avoid internal key collision */}
                      {(() => {
                        // Render at the container's real width so 1 SVG unit = 1px:
                        // this keeps the endpoint dot round and the axis text undistorted.
                        // Geometry comes from `geom` so the drawing and the
                        // pointer maths can never disagree again.
                        //
                        // Nothing at all until that width is known: a chart laid
                        // out at the fallback width inside a narrower box gets
                        // scaled down whole by preserveAspectRatio, and the
                        // correction a frame later is the shrink-then-snap the
                        // eye catches. The box already reserves the height, so
                        // waiting costs no layout shift.
                        if (!chartWidth) return null;
                        const { svgW, svgH, marginTop, marginRight, marginBottom,
                                marginLeft, plotW, plotH, n, axisMax, yStep, xOf, yOf } = geom;
                        const yAxisW = marginLeft;
                        const yTicks: Array<{ value: number }> = [];
                        for (let v = 0; v <= axisMax + 1e-6; v += yStep) yTicks.push({ value: v });


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
                        // Benchmark path: same smoothing as the real line so the
                        // two read as the same kind of object, one just fainter.
                        const usualD = (() => {
                          if (!benchCurve) return '';
                          const pts = benchCurve.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
                          return pts.reduce((acc, p, i) => {
                            if (i === 0) return `M ${p.x},${p.y}`;
                            const prev = pts[i - 1];
                            const cp1x = prev.x + (p.x - prev.x) / 3;
                            const cp2x = prev.x + (p.x - prev.x) * 2 / 3;
                            return `${acc} C ${cp1x},${prev.y} ${cp2x},${p.y} ${p.x},${p.y}`;
                          }, '');
                        })();

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
                                stroke="#F2F1ED" strokeWidth={1} strokeDasharray="3 3"
                              />
                            ))}

                            {/* X-axis baseline */}
                            <line
                              x1={marginLeft} y1={marginTop + plotH}
                              x2={svgW - marginRight} y2={marginTop + plotH}
                              stroke="#E5E5EA" strokeWidth={1}
                            />

                            {/* Area fill */}
                            {/* Benchmark first, so the real line always sits on top of it */}
                            {usualD && (
                              <path
                                d={usualD}
                                fill="none"
                                stroke="#C7C7CC"
                                strokeWidth={1.5}
                                strokeDasharray="4 4"
                                strokeLinecap="round"
                              />
                            )}
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
                                {formatAxisTick(t.value, axisMax)}
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
                      
                      {/* Tooltip. Every dimension comes from `geom`, so it
                          clamps against the chart that is actually on screen
                          rather than a 390x200 one that no longer exists. */}
                      {tooltipData && (() => {
                        const margin = 8;
                        const dotOffset = 14;
                        const rows = (tooltipData.value !== null ? 1 : 0) + (tooltipData.usual !== null ? 1 : 0);
                        const tooltipHeight = 26 + rows * 18;
                        const tooltipWidth = 150;

                        // Anchor above or below whichever marker is showing, and
                        // keep the box inside the plot either way.
                        const anchorY = tooltipData.y;
                        const showAbove = anchorY > geom.svgH / 2;
                        const tooltipY = showAbove
                          ? Math.max(margin + tooltipHeight / 2, anchorY - dotOffset - tooltipHeight / 2)
                          : Math.min(geom.svgH - geom.marginBottom - margin - tooltipHeight / 2, anchorY + dotOffset + tooltipHeight / 2);

                        const leftEdge = geom.marginLeft;
                        const rightEdge = geom.svgW - geom.marginRight;
                        let transformX = '-50%';
                        if (tooltipData.x - tooltipWidth / 2 < leftEdge) transformX = '0%';
                        else if (tooltipData.x + tooltipWidth / 2 > rightEdge) transformX = '-100%';

                        const Row = ({ color, label, amount }: { color: string; label: string; amount: number }) => (
                          <div className="flex items-center gap-1.5" style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: color, flexShrink: 0 }} />
                            <span style={{ color: '#8E8E93', fontSize: 11 }}>{label}</span>
                            <AmountText
                              amount={amount}
                              currency={currency}
                              decimals={0}
                              style={{ color: '#1C1C1E', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}
                            />
                          </div>
                        );

                        return (
                          <>
                            {/* Vertical indicator line */}
                            <div
                              style={{
                                position: 'absolute',
                                left: `${tooltipData.x}px`,
                                top: `${geom.marginTop}px`,
                                height: `${geom.plotH}px`,
                                width: '1px',
                                backgroundColor: '#E5E5EA',
                                pointerEvents: 'none',
                                zIndex: 8,
                              }}
                            />

                            {/* A marker on each line that has a value here, so
                                the two numbers in the box are each attached to
                                something visible. */}
                            {tooltipData.usualY !== null && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: `${tooltipData.x}px`,
                                  top: `${tooltipData.usualY}px`,
                                  transform: 'translate(-50%, -50%)',
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  backgroundColor: '#FFFFFF',
                                  border: '2px solid #C7C7CC',
                                  pointerEvents: 'none',
                                  zIndex: 9,
                                }}
                              />
                            )}
                            {tooltipData.value !== null && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: `${tooltipData.x}px`,
                                  top: `${geom.yOf(tooltipData.value)}px`,
                                  transform: 'translate(-50%, -50%)',
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: '#FFFFFF',
                                  border: '2px solid #3B82F6',
                                  pointerEvents: 'none',
                                  zIndex: 10,
                                }}
                              />
                            )}

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
                                zIndex: 11,
                                width: `${tooltipWidth}px`,
                              }}
                            >
                              <p style={{ color: '#8E8E93', fontSize: '11px', margin: 0, marginBottom: 3, whiteSpace: 'nowrap' }}>
                                {tooltipData.label}
                              </p>
                              {tooltipData.value !== null && (
                                <Row color="#3B82F6" label={periodWord} amount={tooltipData.value} />
                              )}
                              {tooltipData.usual !== null && (
                                <Row color="#C7C7CC" label={benchmarkLabel} amount={tooltipData.usual} />
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Legend under the plot, in the height the chart gave up:
                        naming both lines where the eye lands after reading
                        them, without growing the card. Only when there are two
                        lines to tell apart. */}
                    {benchCurve && (
                      <div className="flex items-center justify-center gap-4 mt-1.5">
                        <span className="flex items-center gap-1.5">
                          <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#3B82F6' }} />
                          <span style={{ color: '#8E8E93', fontSize: 11 }}>{periodWord}</span>
                        </span>
                        <span className="relative flex items-center gap-1.5">
                          <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#C7C7CC' }} />
                          <span style={{ color: '#8E8E93', fontSize: 11 }}>{benchmarkLabel}</span>
                          {/* The dotted line can be the median or the same
                              period last year; when both exist the label is a
                              picker, in the same quiet grammar as "vs. Jul". */}
                          {benchmarkChoices && (
                            <>
                              <ChevronDown className="w-2.5 h-2.5" style={{ color: '#C7C7CC' }} strokeWidth={2.5} />
                              <select
                                aria-label="Benchmark line"
                                value={benchmarkMode}
                                onChange={(e) => setCumulativeBenchmark(e.target.value as 'usual' | 'lastYear')}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                style={{
                                  WebkitTapHighlightColor: 'rgba(255,255,255,0)',
                                  WebkitAppearance: 'none',
                                  appearance: 'none',
                                  touchAction: 'manipulation',
                                  transform: 'translateZ(0)',
                                }}
                              >
                                <option value="usual">{t('chart.yourUsual')}</option>
                                <option value="lastYear">{lastYearLabel}</option>
                              </select>
                            </>
                          )}
                        </span>
                      </div>
                    )}
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
                      {t('rec.title')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: only.color }}
                        aria-hidden="true"
                      />
                      <span style={{ color: '#8E8E93', fontSize: 13 }}>
                        {t('rec.allPre')} <AmountText amount={only.value} currency={currency} decimals={0} /> {t('rec.allMid')}{' '}
                        {recurrenceSliceLabel(only.name).toLowerCase()}.
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
                        {t('rec.title')}
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
                          <span>{t('rec.back')}</span>
                        </button>
                      ) : (
                        /* The donut used to carry the total in its hole. */
                        <AmountText
                          amount={totalValue}
                          currency={currency}
                          decimals={0}
                          className="tabular-nums"
                          style={{ color: '#8E8E93', fontSize: '12px' }}
                        />
                      )}
                    </div>
                    
                    {/* Composition bar. A donut spent ~150px of height on a
                        two-way split and repeated every number in the legend
                        under it; the bar says the same thing in ten pixels and
                        lines up with that legend. Segments stay clickable, so
                        tapping Recurring still opens the breakdown. */}
                    <div
                      className="flex gap-0.5 h-2.5 rounded-full overflow-hidden mb-1"
                      style={{ backgroundColor: '#F2F1ED' }}
                    >
                      {dataWithColors.map((item, index) => {
                        const isSelected = selectedRecurrenceSlice === item.name;
                        return (
                          <button
                            key={`bar-${item.name}-${index}`}
                            aria-label={`${recurrenceSliceLabel(item.name)}, ${item.percentage.toFixed(0)}%`}
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
                            } else if (recurrenceLayer === 'detail') {
                              // Second layer: a cadence row opens the same
                              // transaction drilldown the category table uses.
                              setDrilldownContext({ categoryName: '', subcategoryName: null, recurrence: item.name });
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
                            borderBottomColor: '#F6F5F2',
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
                              {recurrenceSliceLabel(item.name)}
                              {((item.name === 'Recurring' && recurrenceLayer === 'overview') || recurrenceLayer === 'detail') && (
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
                            <AmountText
                              amount={item.value}
                              currency={currency}
                              decimals={0}
                              style={{
                                color: '#1C1C1E',
                                fontSize: '13px',
                                fontWeight: '600',
                                minWidth: '70px',
                                textAlign: 'right'
                              }}
                            />
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
                        {transactionType === 'income' ? t('src.incomeTitle') : t('src.spendingTitle')}
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
                          <p style={{ color: '#8E8E93', fontSize: '10px', margin: 0, marginBottom: '2px' }}>{t('src.total')}</p>
                          <p style={{ color: '#1C1C1E', fontSize: '13px', fontWeight: '600', margin: 0 }}>
                            <AmountText amount={totalValue} currency={currency} decimals={0} />
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
                            borderBottomColor: '#F6F5F2',
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
                            <AmountText
                              amount={item.value}
                              currency={currency}
                              decimals={0}
                              style={{ color: '#1C1C1E', fontSize: '13px', fontWeight: '600', minWidth: '70px', textAlign: 'right' }}
                            />
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

        // The year before the selected one, as a benchmark line - mirroring
        // the cumulative chart's "usual". Two points minimum: one month of
        // last year is not a line.
        const prevYearTrend = trendDataRaw.filter(item => item.year === trendYearFilter - 1);
        const showPrevYear = prevYearTrend.length > 1 && trendData.length > 0;
        // With the overlay on, months sit at fixed calendar slots so January
        // is under January: a running year (8 points) and its full previous
        // year (12) can only be compared on a shared axis. Without it, the
        // old index spread stays.
        // Same array the trend rows were labelled from - slotX is an indexOf
        // against these labels, so the two must speak the same language.
        const MONTH_SLOTS = monthsShort();
        const slotX = (m: string) => (MONTH_SLOTS.indexOf(m) / 11) * 320;
        const chartX = (item: { month: string }, index: number) =>
          showPrevYear ? slotX(item.month) : trendData.length > 1 ? (index / (trendData.length - 1)) * 320 : 160;

        // Calculate Y-axis range - handle negative values for savings.
        // The benchmark's own values count: it must fit inside the plot.
        const allAmounts = [
          ...trendData.map(t => t.amount),
          ...(showPrevYear ? prevYearTrend.map(t => t.amount) : []),
        ];
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
        
        // Find current month and max/min month indices.
        //
        // The month still in progress cannot win Best or Worst: it is a
        // part-finished figure competing against complete ones, so at the
        // start of every month it was "Best" (barely any spending yet) and by
        // the end it often flipped to "Worst" without anything unusual
        // happening. It competes once it is over.
        const currentMonthIndex = trendData.length - 1;
        const rightNow = new Date();
        const isRunningMonth = (t: { month: string; year: number }) =>
          t.year === rightNow.getFullYear() && getMonthNumber(t.month) === rightNow.getMonth();
        const badgeable = trendData
          .map((t, i) => ({ amount: t.amount, i }))
          .filter(({ amount, i }) => amount !== 0 && !isRunningMonth(trendData[i]));
        const maxMonthIndex = badgeable.length
          ? badgeable.reduce((a, b) => (b.amount > a.amount ? b : a)).i
          : -1;
        const minMonthIndex = badgeable.length
          ? badgeable.reduce((a, b) => (b.amount < a.amount ? b : a)).i
          : -1;
        
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
        
        const selectedCat = selectedCategory !== 'All' ? trendSortedCategories.find(c => c.name === selectedCategory) : null;
        
        return (
          <div className="bg-neutral-50">
            {/* Transaction Type Selector */}
            <div className="px-6 pt-2 pb-3 bg-white border-b border-neutral-100">
              <div className="flex items-center gap-3 justify-between">
                {/* The same control as the Dashboard's, one segment wider:
                    an inset track and a thumb that slides to the chosen third.
                    Savings keeps a neutral label - it is a result, not a
                    direction, so it has no meaning-colour of its own. */}
                <div className="relative flex p-1 rounded-full flex-1 min-w-0" style={{ backgroundColor: '#ECEAE4' }}>
                  <div
                    className="absolute rounded-full"
                    style={{
                      top: 4, bottom: 4, left: 4, width: 'calc((100% - 8px) / 3)',
                      backgroundColor: '#FFFFFF',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                      transform:
                        transactionType === 'income' ? 'translateX(100%)'
                        : transactionType === 'savings' ? 'translateX(200%)'
                        : 'translateX(0)',
                      transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
                    }}
                    aria-hidden="true"
                  />
                  {([
                    { key: 'expense', label: t('seg.expenses'), color: '#C2352B' },
                    { key: 'income', label: t('seg.income'), color: '#1F7A43' },
                    { key: 'savings', label: t('seg.savings'), color: '#1C1C1E' },
                  ] as const).map(({ key, label, color }) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTransactionType(key);
                        setSelectedCategory('All');
                        setSelectedSubcategory('All');
                      }}
                      className="relative flex-1 min-w-0 py-1.5 text-[13px] font-medium transition-colors"
                      style={{ color: transactionType === key ? color : '#8E8E93' }}
                    >
                      {label}
                    </button>
                  ))}
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
                      <span className="text-neutral-600 text-xs">{selectedCategory === 'All' ? t('trend.allCategories') : selectedCategory}</span>
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
                          {selectedSubcategory === 'All' ? t('trend.allSubcategories') : selectedSubcategory}
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
                // Totals over the whole period, for the overall rate on the
                // Total Saved card - one number for the year, alongside the
                // per-month average alongside it.
                let periodIncome = 0;
                let periodSpending = 0;

                trendData.forEach(month => {
                  const monthStart = new Date(month.year, getMonthNumber(month.month), 1);
                  const monthEnd = new Date(month.year, getMonthNumber(month.month) + 1, 0, 23, 59, 59, 999);
                  
                  const monthExpenses = expenses.filter(expense => {
                    const expenseDate = parseLocalDate(expense.date);
                    return expenseDate >= monthStart && expenseDate <= monthEnd;
                  });
                  
                  const monthIncome = monthExpenses.filter(e => e.type === 'income').reduce((sum, e) => sum + homeAmount(e, currency), 0);
                  const monthSpending = monthExpenses.filter(e => e.type !== 'income').reduce((sum, e) => sum + homeAmount(e, currency), 0);

                  periodIncome += monthIncome;
                  periodSpending += monthSpending;
                  if (monthIncome > 0) {
                    monthlySavingRates.push(((monthIncome - monthSpending) / monthIncome) * 100);
                  }
                });

                // Overall rate: totals over the period, not an average of
                // monthly rates - this one SHOULD let a fat month speak,
                // because it answers "of everything I earned, how much stayed".
                const overallSavingRate =
                  periodIncome > 0 ? ((periodIncome - periodSpending) / periodIncome) * 100 : null;

                const avgMonthlySavingRate = monthlySavingRates.length > 0
                  ? monthlySavingRates.reduce((sum, rate) => sum + rate, 0) / monthlySavingRates.length
                  : 0;

                return (
                  <div className="grid grid-cols-2 gap-2">
                    <TrendStatCard
                      label={t('trend.totalSaved')}
                      value={<AmountText amount={totalSpent} currency={currency} decimals={0} />}
                      compact={formatAbbreviatedAmount(totalSpent, currency)}
                      compactNode={<AmountText amount={totalSpent} currency={currency} decimals={0} abbreviate="fit" />}
                      valueColor={savingsColor(totalSpent)}
                      corner={trendData.length === 1 ? t('trend.thisMonth') : t('trend.months', { n: trendData.length })}
                      footnote={
                        overallSavingRate !== null ? (
                          <StatChip
                            label={getLanguage() === 'it'
                              ? <>Tasso<span className="max-[359px]:hidden"> di Risparmio</span></>
                              : <><span className="max-[359px]:hidden">Saving </span>Rate</>}
                            value={`${Math.round(overallSavingRate)}%`}
                            tone={Math.round(overallSavingRate)}
                          />
                        ) : undefined
                      }
                    />
                    <TrendStatCard
                      label={t('trend.monthlyAverage')}
                      value={<AmountText amount={avgAmount} currency={currency} decimals={0} />}
                      compact={formatAbbreviatedAmount(avgAmount, currency)}
                      compactNode={<AmountText amount={avgAmount} currency={currency} decimals={0} abbreviate="fit" />}
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
                            label={getLanguage() === 'it'
                              ? <>Tasso<span className="max-[359px]:hidden"> di Risparmio</span></>
                              : <><span className="max-[359px]:hidden">Saving </span>Rate</>}
                            value={`${Math.round(avgMonthlySavingRate)}%`}
                            tone={Math.round(avgMonthlySavingRate)}
                          />
                        ) : (
                          t('trend.noIncome')
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
                const months = trendData.length === 1 ? t('trend.thisMonth') : t('trend.months', { n: trendData.length });
                const txCount = trendData.reduce((sum, month) => sum + month.count, 0);
                const avgTxCount = trendData.length > 0 ? Math.round(txCount / trendData.length) : 0;
                const transactions = (n: number) => t(n === 1 ? 'trend.tx.one' : 'trend.tx.other', { n });

                return (
                  <div className="grid grid-cols-2 gap-2">
                    <TrendStatCard
                      label={isExpense ? t('trend.totalSpent') : t('trend.totalEarned')}
                      value={<AmountText amount={totalSpent} currency={currency} decimals={0} />}
                      compact={formatAbbreviatedAmount(totalSpent, currency)}
                      compactNode={<AmountText amount={totalSpent} currency={currency} decimals={0} abbreviate="fit" />}
                      footnote={isExpense ? `${months} · ${transactions(txCount)}` : months}
                    />
                    <TrendStatCard
                      label={t('trend.monthlyAverage')}
                      value={<AmountText amount={avgAmount} currency={currency} decimals={0} />}
                      compact={formatAbbreviatedAmount(avgAmount, currency)}
                      compactNode={<AmountText amount={avgAmount} currency={currency} decimals={0} abbreviate="fit" />}
                      footnote={isExpense ? transactions(avgTxCount) : undefined}
                    />
                  </div>
                );
              })()}
            </div>

            {/* Line Chart */}
            <div className="px-6 py-4 bg-white mb-2">
              <h3 className="text-neutral-900 font-semibold text-sm mb-3">
                {transactionType === 'income' ? t('trend.chart.income') : transactionType === 'savings' ? t('trend.chart.savings') : t('trend.chart.spending')}
              </h3>
              
              {trendData.length === 0 ? (
                <div className="text-center py-8 text-neutral-400 text-sm">
                  {t('trend.noData')}
                </div>
              ) : (
                <>
                  <div className="relative">
                    {/* Y-axis labels */}
                    <div className="absolute left-0 top-0 h-24 flex flex-col justify-between text-[10px] text-neutral-400 tabular-nums pr-2 w-12 font-medium">
                      <AmountText amount={yMax} currency={currency} decimals={0} />
                      <AmountText amount={yMin + yRange / 2} currency={currency} decimals={0} />
                      <AmountText amount={yMin} currency={currency} decimals={0} />
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
                          
                          {/* Last year, month by month - same dash family as
                              the cumulative chart's benchmark, drawn first so
                              this year always sits on top of it. */}
                          {showPrevYear && (
                            <path
                              d={(() => {
                                const pts = prevYearTrend.map(item => ({
                                  x: slotX(item.month),
                                  y: yRange > 0 ? 88 - ((item.amount - yMin) / yRange) * 88 : 44,
                                }));
                                return pts.reduce((acc, pt, i, a) => {
                                  if (i === 0) return `M ${pt.x},${pt.y}`;
                                  const prev = a[i - 1];
                                  const cp1x = prev.x + (pt.x - prev.x) / 3;
                                  const cp2x = prev.x + (pt.x - prev.x) * 2 / 3;
                                  return `${acc} C ${cp1x},${prev.y} ${cp2x},${pt.y} ${pt.x},${pt.y}`;
                                }, '');
                              })()}
                              fill="none"
                              stroke="#C7C7CC"
                              strokeWidth="1.5"
                              strokeDasharray="4 4"
                              strokeLinecap="round"
                            />
                          )}

                          {/* Trend Area Fill */}
                          {trendData.length > 1 && (
                            <path
                              d={`
                                M ${chartX(trendData[0], 0)},88 
                                ${trendData.map((item, index) => {
                                  const x = chartX(item, index);
                                  const y = yRange > 0 ? 88 - ((item.amount - yMin) / yRange) * 88 : 44;
                                  return `L ${x},${y}`;
                                }).join(' ')}
                                L ${chartX(trendData[trendData.length - 1], trendData.length - 1)},88 Z
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
                                  x: chartX(item, index),
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
                            const x = chartX(item, index);
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
                    {(showPrevYear ? MONTH_SLOTS.map(m => ({ month: m })) : trendData).map((item, index, arr) => {
                      const leftPosition = showPrevYear
                        ? (MONTH_SLOTS.indexOf(item.month) / 11) * 100
                        : arr.length > 1 ? (index / (arr.length - 1)) * 100 : 50;
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

                  {/* Legend, same shape as the cumulative chart's: two lines
                      on one plot need naming, and years name themselves best */}
                  {showPrevYear && (
                    <div className="flex items-center justify-center gap-4 mt-3">
                      <span className="flex items-center gap-1.5">
                        <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#3B82F6' }} />
                        <span style={{ color: '#8E8E93', fontSize: 11 }}>{trendYearFilter}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#C7C7CC' }} />
                        <span style={{ color: '#8E8E93', fontSize: 11 }}>{trendYearFilter - 1}</span>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Monthly Breakdown - High Density. For expenses the heading is a
                picker: the same rows bucketed by day of the week instead, the
                rhythm view. Income (payday-dominated) and savings (a monthly
                residual) have no meaningful weekday shape, so no picker. */}
            {(() => {
            const showDow = trendBreakdown === 'dow' && transactionType === 'expense';
            // Months that have not started yet are not on offer, and a saved
            // scope pointing at one (chosen in December, reopened in a new
            // year) falls back to the full year rather than showing an empty
            // future month.
            const dowNow = new Date();
            const dowMaxMonth = trendYearFilter === dowNow.getFullYear() ? dowNow.getMonth() : 11;
            const dowMonth = trendDowMonth !== null && trendDowMonth > dowMaxMonth ? null : trendDowMonth;
            // Category filtering matches the monthly rows; year, income and
            // recurrence are the lib's job.
            const dowSource = showDow
              ? expenses.filter((e) => {
                  if (selectedCategory === 'All') return true;
                  if (e.category.name !== selectedCategory) return false;
                  return selectedSubcategory === 'All' || e.subcategory === selectedSubcategory;
                })
              : [];
            const dowOpts = { year: trendYearFilter, month: dowMonth, weekStartsOn };
            // Both cuts, always: the One-offs view says what it left out, in
            // euros. Bars are relative, so excluding recurring spending that
            // falls evenly across the week changes almost nothing the eye can
            // see - the numbers change, the shape does not - and a toggle that
            // "does nothing" visible reads as broken.
            const dowAll = showDow ? dayOfWeekBreakdown(dowSource, currency, dowOpts) : [];
            const dowOneOff = showDow && trendDowOneOffs
              ? dayOfWeekBreakdown(dowSource, currency, { ...dowOpts, oneOffsOnly: true })
              : dowAll;
            const dowBuckets = trendDowOneOffs ? dowOneOff : dowAll;
            const dowExcludedTotal = dowAll.reduce((s, b) => s + b.total, 0) - dowOneOff.reduce((s, b) => s + b.total, 0);
            const dowExcludedCount = dowAll.reduce((s, b) => s + b.txCount, 0) - dowOneOff.reduce((s, b) => s + b.txCount, 0);
            const dowMax = Math.max(...dowBuckets.map((b) => b.avg), 0);
            const dowLine = showDow ? dowTakeaway(dowBuckets) : null;
            const M3 = monthsShort();
            const MFULL = monthsFull();
            return (
            <div className="px-6 py-3 bg-white mb-2">
              <div className="flex items-baseline justify-between mb-2">
                <span className="relative flex items-center gap-1">
                  <h3 className="text-neutral-900 font-semibold text-sm">
                    {showDow ? t('trend.dowTitle') : t('trend.breakdownTitle')}
                  </h3>
                  {transactionType === 'expense' && (
                    <>
                      <ChevronDown className="w-2.5 h-2.5" style={{ color: '#C7C7CC' }} strokeWidth={2.5} />
                      <select
                        aria-label="Breakdown view"
                        value={showDow ? 'dow' : 'monthly'}
                        onChange={(e) => setTrendBreakdown(e.target.value as 'monthly' | 'dow')}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        style={{
                          WebkitTapHighlightColor: 'rgba(255,255,255,0)',
                          WebkitAppearance: 'none',
                          appearance: 'none',
                          touchAction: 'manipulation',
                          transform: 'translateZ(0)',
                        }}
                      >
                        <option value="monthly">{t('trend.optBreakdown')}</option>
                        <option value="dow">{t('trend.optDow')}</option>
                      </select>
                    </>
                  )}
                </span>
                {/* The tick on every bar below marks the same value; this names
                    it once. Expenses only - the budget is a spending limit,
                    and a MONTHLY one, so it has no place on a weekday row. */}
                {!showDow && transactionType === 'expense' && selectedCategory === 'All' && !!monthlyBudget && monthlyBudget > 0 && (
                  <span className="flex items-baseline gap-1.5 text-[10px]" style={{ color: '#A0A0A8' }}>
                    <span className="self-center w-0.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(28,28,30,0.35)' }} />
                    {t('trend.budgetMark')} <AmountText amount={monthlyBudget} currency={currency} decimals={0} />
                  </span>
                )}
              </div>

              {showDow && (
                <>
                  {/* The view's own scopes: one month of the selected year, and
                      whether recurring rows count. In a single month a rule like
                      rent lands entirely on one weekday - one tap removes it. */}
                  <div className="flex items-center justify-between gap-2 mt-1 mb-1">
                    <select
                      aria-label="Day of week scope"
                      value={dowMonth === null ? 'year' : String(dowMonth)}
                      onChange={(e) => setTrendDowMonth(e.target.value === 'year' ? null : Number(e.target.value))}
                      className="pl-2.5 pr-7 py-1 rounded-md text-xs text-neutral-600 border border-neutral-200"
                      style={{
                        WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        touchAction: 'manipulation',
                        backgroundColor: '#FAFAFA',
                        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238E8E93' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        transform: 'translateZ(0)',
                      }}
                    >
                      <option value="year">{t('dow.fullYear', { year: trendYearFilter })}</option>
                      {MFULL.slice(0, dowMaxMonth + 1).map((m, i) => (
                        <option key={m} value={String(i)}>{m} {trendYearFilter}</option>
                      ))}
                    </select>
                    <div className="flex rounded-md overflow-hidden border border-neutral-200">
                      {[{ v: false, label: t('dow.all') }, { v: true, label: t('dow.oneOffs') }].map(({ v, label }) => (
                        <button
                          key={label}
                          onClick={() => setTrendDowOneOffs(v)}
                          className="px-2.5 leading-none"
                          style={{
                            fontSize: 11,
                            paddingTop: 6,
                            paddingBottom: 6,
                            backgroundColor: trendDowOneOffs === v ? '#1C1C1E' : '#FAFAFA',
                            color: trendDowOneOffs === v ? '#FFFFFF' : '#8E8E93',
                            fontWeight: trendDowOneOffs === v ? 600 : 500,
                            transition: 'background-color 0.15s ease',
                            WebkitTapHighlightColor: 'rgba(255, 255, 255, 0)',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {dowMax > 0 ? (
                    <>
                      {/* Averages, not totals: a window holding five Saturdays
                          and four Tuesdays would crown Saturday just for
                          occurring more often. The day count keeps a thin
                          sample honest. */}
                      <div className="flex items-center gap-2.5 pb-1.5 mt-2 mb-1 border-b border-neutral-100">
                        <div className="w-[72px] flex-shrink-0"></div>
                        <div className="flex-1 min-w-0"></div>
                        <div className="w-16 flex-shrink-0 text-right text-[9px] text-neutral-400 uppercase tracking-wide">{t('dow.avgPerDay')}</div>
                        <div className="w-8 flex-shrink-0 text-right text-[9px] text-neutral-400 uppercase tracking-wide">{t('dow.days')}</div>
                      </div>
                      <div className="space-y-0">
                        {dowBuckets.map((b) => (
                          <div key={b.day} className="w-full flex items-center gap-2.5 py-2.5">
                            <div className="w-[72px] flex-shrink-0 text-left text-[11px] text-neutral-600">{daysFull()[b.day]}</div>
                            <div className="relative flex-1 min-w-0 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-neutral-400 transition-all"
                                style={{ width: b.avg > 0 ? `${Math.max(2, (b.avg / dowMax) * 100)}%` : '0%' }}
                              />
                            </div>
                            <div className="w-16 flex-shrink-0 text-xs font-semibold tabular-nums text-right text-neutral-900">
                              <AmountText amount={b.avg} currency={currency} decimals={0} />
                            </div>
                            <div className="w-8 flex-shrink-0 text-right text-[11px] text-neutral-400 tabular-nums">
                              {b.occurrences > 0 ? `x${b.occurrences}` : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                      {dowLine && (
                        <p className="mt-2 text-[11px]" style={{ color: '#8E8E93' }}>{dowLine}</p>
                      )}
                      {/* What the toggle actually did, in euros. Without this
                          it can look dead: recurring spending spread across
                          the week lowers every bar in proportion, and bars
                          are relative, so the picture barely moves. */}
                      {trendDowOneOffs && (
                        <p className="mt-1 text-[11px]" style={{ color: '#B0B0B5' }}>
                          {dowExcludedCount > 0 ? (
                            <>
                              {t(dowExcludedCount === 1 ? 'dow.leavingOut.one' : 'dow.leavingOut.other', { n: dowExcludedCount })}{' '}
                              (<AmountText amount={dowExcludedTotal} currency={currency} decimals={0} />).
                            </>
                          ) : (
                            t('dow.matchesAll')
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="py-6 text-center">
                      <p className="text-sm text-neutral-400">
                        {t('dow.noSpending')}{trendDowOneOffs && dowExcludedCount > 0 ? t('dow.outsideRecurring') : ''}.
                      </p>
                      {trendDowOneOffs && dowExcludedCount > 0 && (
                        <p className="mt-1 text-[11px]" style={{ color: '#B0B0B5' }}>
                          {t(dowExcludedCount === 1 ? 'dow.leavingOut.one' : 'dow.leavingOut.other', { n: dowExcludedCount })}{' '}
                          (<AmountText amount={dowExcludedTotal} currency={currency} decimals={0} />).
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {!showDow && (
              <>

              {/* Column headers. Shown whenever a row carries more than one
                  number - a category drilldown (weight + count) or the savings
                  view (rate), where an unlabelled "-12%" next to an unlabelled
                  amount left the reader to guess which was which.
                  Widths mirror the row below exactly; both branch on the same
                  two conditions. */}
              {(selectedCategory !== 'All' || transactionType === 'savings') && (
                <div className="flex items-center gap-2.5 pb-1.5 mt-2 mb-1 border-b border-neutral-100">
                  {/* Month spacer */}
                  <div className="w-[72px] flex-shrink-0"></div>
                  {/* Bar chart spacer */}
                  <div className={`${selectedCategory === 'All' ? 'flex-1' : 'w-32'} min-w-0`}></div>
                  {/* Amount header */}
                  <div className={`${selectedCategory === 'All' ? 'w-16' : 'w-14'} flex-shrink-0 text-right text-[9px] text-neutral-400 uppercase tracking-wide`}>
                    {transactionType === 'savings' ? t('trend.colSaved') : t('trend.colAmount')}
                  </div>
                  {selectedCategory !== 'All' && (
                    <>
                      {/* Weight header */}
                      <div className="w-10 flex-shrink-0 text-right text-[9px] text-neutral-400 uppercase tracking-wide">
                        {t('trend.colWeight')}
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
                      {t('trend.colRate')}
                    </div>
                  )}
                  {/* Badges spacer */}
                  <div className="w-11 flex-shrink-0"></div>
                </div>
              )}
              
              <div className="space-y-0">
                {trendData.map((item, index) => {
                  const isCurrentMonth = index === currentMonthIndex;
                  
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
                  //
                  // With a budget set, the scale stretches to include it, so
                  // the budget tick always sits on the track - and every bar
                  // falling short of the tick is a month that stayed under.
                  const showBudgetTick =
                    transactionType === 'expense' && selectedCategory === 'All' && !!monthlyBudget && monthlyBudget > 0;
                  let barWidth = 0;
                  const barMax = Math.max(...allAmounts.map(a => Math.abs(a)), showBudgetTick ? monthlyBudget! : 0);
                  const barValue = Math.abs(item.amount);
                  if (barMax > 0 && barValue > 0) {
                    barWidth = Math.max(2, (barValue / barMax) * 100);
                  }
                  const budgetPct = showBudgetTick && barMax > 0 ? (monthlyBudget! / barMax) * 100 : 0;

                  // Colour carries STATUS, the pills carry RANKING - never
                  // both. Bars used to also go red for the worst expense month
                  // and green for the best savings month, and the max month's
                  // name and amount were tinted on top: three systems saying
                  // overlapping things on one row. Now the only coloured bar
                  // is a negative savings month - a fact about the month
                  // (money lost), not a comparison - and Best/Worst live in
                  // the badge column alone.
                  const isLossMonth = transactionType === 'savings' && item.amount < 0;
                  const barClass = isLossMonth ? 'bg-red-400' : 'bg-neutral-400';
                  
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
                      {/* Month - always neutral; ranking lives in the badges */}
                      <div className="w-[72px] flex-shrink-0 text-left text-[11px] tabular-nums self-center text-neutral-600">
                        {MFULL[M3.indexOf(item.month)] ?? item.month}
                      </div>
                      
                      {/* Visual indicator - mini bar */}
                      <div className={`relative ${selectedCategory === 'All' ? 'flex-1' : 'w-32'} min-w-0 h-1.5 bg-neutral-100 rounded-full overflow-hidden self-center`}>
                        <div
                          className={`h-full rounded-full transition-all ${barClass}`}
                          style={{ width: `${barWidth}%` }}
                        />
                        {/* Budget tick. Same x on every row (the rows share one
                            scale), so the ticks line up into a rule through the
                            column: bars ending short of it stayed under budget,
                            bars crossing it went over. */}
                        {showBudgetTick && (
                          <div
                            className="absolute top-0 bottom-0"
                            style={{ left: `calc(${budgetPct}% - 2px)`, width: 2, backgroundColor: 'rgba(28,28,30,0.35)' }}
                          />
                        )}
                      </div>
                      
                      {/* Amount */}
                      <div className={`${selectedCategory === 'All' ? 'w-16' : 'w-14'} flex-shrink-0 text-xs font-semibold tabular-nums text-right self-center text-neutral-900`}>
                        <AmountText amount={item.amount} currency={currency} decimals={0} />
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
                            {t('trend.best')}
                          </span>
                        )}
                        {trendData.length > 1 && index === worstMonthIndex && item.amount !== 0 && index !== bestMonthIndex && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium leading-none">
                            {t('trend.worst')}
                          </span>
                        )}
                        {/* The running month sits in the same column, marked
                            as partial in the neutral grey the Best/Worst pills
                            use for their colours - it is a status, not a
                            verdict. It is also why that row has no badge. */}
                        {trendData.length > 1 && isRunningMonth(item) && (
                          <span className="text-[9px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded font-medium leading-none whitespace-nowrap">
                            {t('trend.soFar')}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              </>
              )}
            </div>
            );
            })()}

            {/* Category Breakdown Table - Only for Expenses and Income */}
            {transactionType !== 'savings' && selectedCategory === 'All' && trendFilteredTransactions.length > 0 && (
              <TrendCategoryBreakdown
                trendFilteredTransactions={trendFilteredTransactions}
                trendSortedCategories={trendSortedCategories}
                trendExpandedCategory={trendExpandedCategory}
                setTrendExpandedCategory={setTrendExpandedCategory}
                currency={currency}
                // The same denominator as the Monthly Average card above:
                // months where this type had any activity at all. Without it
                // each category divided by its own active months, and a
                // one-off (a tax refund, an annual bill) showed its whole
                // amount as a "monthly average".
                monthCount={trendData.filter(t => t.amount > 0).length}
              />
            )}
          </div>
        );
      })()}

      {/* Jump straight to a period, from the period title on the hero card.
          Mounted only while open so it always starts on the year on screen. */}
      {isPeriodPickerOpen && (
        <PeriodPickerModal
          type={timePeriodType}
          year={selectedYear}
          month={selectedMonth}
          quarter={selectedQuarter}
          years={selectableYears}
          activeMonths={activeMonths}
          onSelect={(choice) => {
            setTimePeriodType(choice.type);
            setSelectedYear(choice.year);
            setSelectedMonth(choice.month);
            setSelectedQuarter(choice.quarter);
            // Same housekeeping as the arrows: a drilldown belongs to the
            // period it was opened from, and a pinned comparison index is
            // counted in the old unit.
            setExpandedCategory(null);
            if (choice.type !== timePeriodType) setComparisonBaseline('previous');
            setIsPeriodPickerOpen(false);
          }}
          onClose={() => setIsPeriodPickerOpen(false)}
        />
      )}

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
              const subcatName = expense.subcategory || t('trend.other');
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
                      {drilldownContext.recurrence
                        ? recurrenceSliceLabel(drilldownContext.recurrence)
                        : drilldownContext.subcategoryName
                        ? (drilldownContext.subcategoryName === UNCATEGORIZED ? t('trend.other') : drilldownContext.subcategoryName)
                        : drilldownContext.categoryName}
                    </h3>
                    {(drilldownContext.recurrence || drilldownContext.subcategoryName) && (
                      <span className="text-[10px] text-neutral-400 font-bold px-2 py-0.5 bg-neutral-50 rounded-full border border-neutral-100 uppercase tracking-tight">
                        {drilldownContext.recurrence ? t('rec.recurring') : drilldownContext.categoryName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span className="text-neutral-500">{getPeriodDisplayName()}</span>
                    <span className="text-neutral-300">·</span>
                    <AmountText
                      amount={drilldownTransactions.reduce((sum, txn) => sum + homeAmount(txn, currency), 0)}
                      currency={currency}
                      decimals={0}
                      style={{ color: transactionType === 'expense' ? '#D32F2F' : '#2E7D32' }}
                    />
                  </div>
                </div>
                
                <div className="flex-shrink-0 pt-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrilldownSortBy(prev => prev === 'time' ? 'amount' : 'time');
                    }}
                    // Same anatomy as every other sort toggle in the app
                    // (Categories' A-Z/€): ArrowUpDown icon + short label on
                    // the grey pill. This was the one sort control drawn
                    // differently - Clock icon, uppercase, darker pill.
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ backgroundColor: '#F2F1ED' }}
                    aria-label="Toggle sort order"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />
                    <span className="text-xs" style={{ color: '#8E8E93' }}>
                      {drilldownSortBy === 'time' ? t('trend.sortTime') : CURRENCIES[currency]?.symbol || '€'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            
            {/* List */}
            <div className="flex-1 overflow-y-auto pb-10 bg-[#F6F5F2]">
              {drilldownList.mode === 'empty' ? (
                <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                    <Receipt className="w-8 h-8 text-neutral-300" />
                  </div>
                  <p className="text-neutral-500 text-sm font-medium">{t('cat.noTransactions')}</p>
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