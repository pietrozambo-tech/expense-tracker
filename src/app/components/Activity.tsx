import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { FilterBar } from './FilterBar';
import { ALL_YEARS } from './ActivityFilterSheets';
import { ActivityDayGroup } from './ActivityDayGroup';
import { ExpenseItem } from './ExpenseItem';
import { IncomeItem } from './IncomeItem';
import { CategoryFilterModal } from './CategoryFilterModal';
import { SubcategoryFilterModal } from './SubcategoryFilterModal';
import { TripFilterModal } from './TripFilterModal';
import { SourceFilterModal } from './SourceFilterModal';
import { SearchModal } from './SearchModal';
import { ExportScopeModal } from './ExportScopeModal';
import { SourceSelectorModal } from './SourceSelectorModal';
import { ActivitySelectionBar } from './ActivitySelectionBar';
import { BulkCategoryModal } from './BulkCategoryModal';
import { TripsSheet } from './TripsSheet';
import { TripAssignModal } from './TripAssignModal';
import { detectTrips, travelCategoryOf, tripDatesLabel, type Trip } from '../lib/trips';
import { clampYear, selectableMonths, selectableYears } from '../lib/periods';
import { CURRENCIES, mineAmount } from '../utils/currency';
import { byRecency } from '../lib/shared';
import { AmountText } from './AmountText';
import { switchGlow } from './categoryColors';
import { t } from '../i18n';
import { monthsShort, daysShort } from '../i18n/store';
import { toDateStr } from '../lib/recurrence';
import { CheckSquare, Download, MoreVertical, Plane, X } from 'lucide-react';
import { buildTransactionsCsv, downloadTransactionsCsv } from '../lib/csv';
import { toast } from 'sonner';
import type { Category, Transaction, Source } from '../types';
import { parseLocalDate } from '../lib/dates';

type ActivityTypeFilter = 'all' | 'expense' | 'income';

// Everything that makes up "where the user was": the filter bar, plus how far
// down the list they had scrolled. Opening a transaction routes through the
// 'add' screen, which unmounts this tab entirely - without a snapshot the user
// comes back to an unfiltered list, at the top, and has to find their place
// again.
export interface ActivityViewState {
  activityType: ActivityTypeFilter;
  selectedYear: string;
  selectedMonth: string;
  categoryFilter: string;
  subcategoryFilter: string;
  searchQuery: string;
  typeFilter: string;
  sourceFilter: string;
  /** A trip key, or 'All'. */
  tripFilter?: string;
  sortBy: ActivitySort;
  scrollTop: number;
}

/** Date (newest first) is the default; amount is largest-first, ungrouped. */
export type ActivitySort = 'date' | 'amount';

interface ActivityProps {
  transactions: Transaction[];
  /** First day of the week, for the this-week strip. 1 Monday, 0 Sunday. */
  weekStartsOn?: number;
  onEditTransaction: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
  /**
   * Delete a whole selection.
   *
   * The confirmation, the "these repeat" question and the undo all live in
   * App, because all three need the recurring rules and the household this
   * screen has never been given. `onDone` is how App says the rows actually
   * went - a cancelled confirmation must leave the selection exactly as the
   * user built it.
   */
  onBulkDelete?: (ids: string[], onDone: () => void) => void;
  onBulkCategory?: (ids: string[], category: Category, subcategory: string | null) => void;
  onBulkSource?: (ids: string[], sourceId: string) => void;
  /** Put a selection in a trip, or take it out with `null`. */
  onBulkTrip?: (ids: string[], name: string | null) => void;
  /**
   * Selection mode is on or off, so App can take the dock away.
   *
   * The action bar stands exactly where the dock stands, in the same dark
   * glass - leave both mounted and the dock's labels ghost up through it.
   * Reported separately from onModalOpenChange because a filter sheet closing
   * would otherwise hand the dock back mid-selection.
   */
  onSelectModeChange?: (on: boolean) => void;
  onModalOpenChange?: (isOpen: boolean) => void;
  categories: any[];
  incomeCategories: any[];
  currency: string;
  sources: Source[];
  /**
   * The sources a row may be MOVED to, which is not the same list as the one
   * you may filter by: a retired partner source stays filterable for as long
   * as rows still wear it, and must never be assignable again.
   */
  assignableSources?: Source[];
  /** The household member's name, so a filtered export names who shared. */
  partnerName?: string;
  // One-shot: start with this type filter selected (e.g. 'Imported' from the
  // post-import "Review in Activity" button). Consumed on mount so the next
  // ordinary visit starts clean. Carries the YEAR of the imported batch and
  // the catch-all category too: an import of last year's data with the filter
  // still on the current month showed an empty list and looked like the
  // import had vanished.
  preset?: { typeFilter: string; year?: string; categoryFilter?: string };
  onPresetConsumed?: () => void;
  // Survives an edit round-trip; the parent nulls it once the user actually
  // leaves the tab, so an ordinary visit starts clean.
  viewStateRef?: React.MutableRefObject<ActivityViewState | null>;
  /** Their unread changes, by transaction id, for the row marks. Empty for
   *  anyone without a household - the tab is byte-identical then. */
  sharedBadges?: Map<string, 'new' | 'updated'>;
}

// The list's tail. The rows above the cap are already on screen; this row
// stands in for the rest, saying how many - so a capped list reads as "ends
// here, more on request" rather than quietly shorter than its own totals.
function ShowMoreRows({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-show-more-rows
      className="w-full py-3.5 text-center transition-colors active:bg-neutral-50"
      style={{ color: 'var(--accent-ink)', fontSize: 13.5, fontWeight: 600 }}
    >
      {t(n === 1 ? 'act.showMore.one' : 'act.showMore.other', { n })}
    </button>
  );
}

export function Activity({
  transactions,
  onEditTransaction,
  onDeleteTransaction,
  onBulkDelete,
  onBulkCategory,
  onBulkSource,
  onBulkTrip,
  onSelectModeChange,
  onModalOpenChange,
  sharedBadges,
  categories,
  incomeCategories,
  currency,
  sources,
  assignableSources,
  partnerName,
  preset,
  onPresetConsumed,
  viewStateRef,
  weekStartsOn = 1
}: ActivityProps) {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  // selectedMonth is a view-state KEY: the month INDEX as a string ('0'-'11'),
  // or 'year' for the whole year - language-neutral, so the filter labels can
  // localise freely around it.
  const currentMonth = String(now.getMonth());

  // Restore what the user had set up, unless a preset ("Imported", from the
  // post-import nudge) was handed in - that must win and start clean.
  const saved = preset ? null : viewStateRef?.current ?? null;

  const [activityType, setActivityType] = useState<ActivityTypeFilter>(saved?.activityType ?? 'all');
  // The preset pins the year the batch actually landed in, over the whole
  // year - the imported rows must be on screen when the tab opens.
  const [selectedYear, setSelectedYear] = useState(preset?.year ?? saved?.selectedYear ?? currentYear);
  // How many rows the LIST paints. The totals above it always count
  // everything - this caps only the DOM. A year of history is a couple of
  // thousand nodes, and painting them all made switching to All years (and
  // every return to this tab) a 1.5-2.5s stall on desktop, worse on a phone.
  // 250 covers weeks of scrolling; the tail loads on request.
  const RENDER_CAP = 250;
  const [renderLimit, setRenderLimit] = useState(RENDER_CAP);
  const [selectedMonth, setSelectedMonth] = useState(preset ? 'year' : saved?.selectedMonth ?? currentMonth);
  const [categoryFilter, setCategoryFilter] = useState(preset?.categoryFilter ?? saved?.categoryFilter ?? 'All');
  const [subcategoryFilter, setSubcategoryFilter] = useState(saved?.subcategoryFilter ?? 'All');
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? '');
  const [typeFilter, setTypeFilter] = useState(preset?.typeFilter ?? saved?.typeFilter ?? 'All'); // All / One-off / Recurring / Imported
  const [sourceFilter, setSourceFilter] = useState(saved?.sourceFilter ?? 'All'); // 'All' or a source id
  const [tripFilter, setTripFilter] = useState(saved?.tripFilter ?? 'All'); // 'All' or a trip key
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ActivitySort>(saved?.sortBy ?? 'date');

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSubcategoryModalOpen, setIsSubcategoryModalOpen] = useState(false);
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // The preset is applied via the useState initialiser above; report it
  // consumed so the parent clears it and the next visit starts unfiltered.
  useEffect(() => {
    if (preset) onPresetConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the snapshot current on every change (ref write - no re-render), so
  // whatever is on screen is what comes back after editing a transaction.
  // Scroll is tracked separately below and carried through untouched.
  useEffect(() => {
    if (!viewStateRef) return;
    viewStateRef.current = {
      activityType,
      selectedYear,
      selectedMonth,
      categoryFilter,
      subcategoryFilter,
      searchQuery,
      typeFilter,
      sourceFilter,
      tripFilter,
      sortBy,
      scrollTop: viewStateRef.current?.scrollTop ?? 0,
    };
  }, [viewStateRef, activityType, selectedYear, selectedMonth, categoryFilter, subcategoryFilter, searchQuery, typeFilter, sourceFilter, tripFilter, sortBy]);

  // Put the list back where it was, before the browser paints - restoring in a
  // plain effect would show the top of the list for a frame first. The filters
  // are restored in the same commit, so the list is already its old height and
  // the offset still means what it meant.
  const listRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const top = saved?.scrollTop ?? 0;
    if (top && listRef.current) listRef.current.scrollTop = top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Transactions narrowed by the All/Expenses/Income control — every other
  // filter and the header totals work off this set
  const typedTransactions = transactions.filter(t =>
    activityType === 'all' ? true : activityType === 'income' ? t.type === 'income' : t.type !== 'income'
  );

  // Get available years (only years with data)
  // Never a period that has not happened. Built from lib/periods so this tab,
  // Trend and the Dashboard cannot disagree about what is browsable - one
  // future-dated row used to put its month in this picker, and the list then
  // showed spending that has not occurred.
  const availableYears = selectableYears(typedTransactions.map((t) => t.date)).map(String);
  const availableMonths = selectableMonths(
    typedTransactions.map((t) => t.date),
    parseInt(selectedYear, 10),
  ).map(String);

  // A restored view can point at a year that has since become unreachable -
  // or was future when it was saved. Fall back to this year rather than render
  // an empty list under a year the picker no longer offers.
  useEffect(() => {
    if (selectedYear === ALL_YEARS) return;
    const clamped = String(clampYear(parseInt(selectedYear, 10)));
    if (clamped !== selectedYear) {
      setSelectedYear(clamped);
      setSelectedMonth('year');
    }
  }, [selectedYear]);

  // A new filter is a new list: the cap starts over rather than carrying a
  // deep "Show more" from a different view.
  useEffect(() => {
    setRenderLimit(RENDER_CAP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth, categoryFilter, subcategoryFilter, sourceFilter, typeFilter, tripFilter, searchQuery, activityType, sortBy]);

  // Auto-adjust selected month if it doesn't exist in the selected year
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth) && selectedMonth !== 'year') {
      setSelectedMonth('year');
    }
  }, [selectedYear, availableMonths, selectedMonth]);

  // Get date range based on selected year and month
  const getDateRange = () => {
    // "All years" - a trip over New Year is one trip, and no single year
    // contains it. Handled before anything parses the year, because
    // parseInt('all') is NaN and the month branch below would quietly fall
    // through to "this month" instead.
    if (selectedYear === ALL_YEARS) {
      return { start: new Date(-8640000000000000), end: new Date(8640000000000000) };
    }
    const year = parseInt(selectedYear);

    if (selectedMonth === 'year') {
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
    }

    const monthIndex = parseInt(selectedMonth, 10);

    if (!isNaN(year) && monthIndex >= 0 && monthIndex <= 11) {
      return {
        start: new Date(year, monthIndex, 1),
        end: new Date(year, monthIndex + 1, 0, 23, 59, 59)
      };
    }
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    };
  };

  // Trips are read out of the WHOLE ledger, never the filtered view: a trip's
  // flights are booked months before it is taken, so any period would cut one
  // in half. See lib/trips.ts.
  const travelCategory = travelCategoryOf(categories);
  const trips = useMemo(
    () => detectTrips(transactions, travelCategory, (t) => mineAmount(t, currency)),
    [transactions, travelCategory, currency],
  );
  /**
   * The rows of the trip being filtered to, by id.
   *
   * A trip is not a field, so it cannot be matched row by row like a category
   * - it is a set the grouping already worked out, and this is that set. It
   * also handles the case a name match never could: two Formenteras a year
   * apart are two entries, and picking one means its own rows and not the
   * other's.
   *
   * A key that names no trip any more - renamed, or its rows deleted - is
   * read as no filter at all rather than as a filter that matches nothing.
   * The saved view outliving the trip it pointed at is the ordinary case, and
   * an empty list with no explanation is the worst possible answer to it.
   */
  const tripRowIds = useMemo(() => {
    if (tripFilter === 'All') return null;
    const hit = trips.find((tr) => tr.key === tripFilter);
    return hit ? new Set(hit.rows.map((r) => r.id)) : null;
  }, [tripFilter, trips]);
  const activeTrip = tripFilter === 'All' ? null : trips.find((tr) => tr.key === tripFilter) ?? null;

  const filteredTransactions = typedTransactions.filter((t) => {
    const { start, end } = getDateRange();
    const date = parseLocalDate(t.date);
    if (date < start || date > end) return false;

    if (categoryFilter !== 'All' && t.category.name !== categoryFilter) return false;
    if (subcategoryFilter !== 'All' && t.subcategory !== subcategoryFilter) return false;
    if (sourceFilter !== 'All' && t.sourceId !== sourceFilter) return false;
    if (tripRowIds && !tripRowIds.has(t.id)) return false;
    if (searchQuery && !t.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    // Recurrence filter
    const recurrence = t.recurrence || 'Never repeat';
    if (typeFilter === 'One-off' && recurrence !== 'Never repeat') return false;
    if (typeFilter === 'Recurring' && recurrence === 'Never repeat') return false;
    // Everything a past Import created, as one reviewable group. No marker on
    // the rows themselves - the flag only exists behind this filter.
    if (typeFilter === 'Imported' && !t.importedAt) return false;

    return true;
  });

  // Get available subcategories based on selected category
  const getAvailableSubcategories = () => {
    if (categoryFilter === 'All') {
      const allSubcats = new Set<string>();
      typedTransactions.forEach(t => {
        if (t.subcategory) allSubcats.add(t.subcategory);
      });
      return Array.from(allSubcats).sort();
    }
    const activeCategories = activityType === 'income' ? incomeCategories : activityType === 'expense' ? categories : [...categories, ...incomeCategories];
    const category = activeCategories.find(c => c.name === categoryFilter);
    return category?.subcategories || [];
  };

  const handleCategoryChange = (category: string) => {
    setCategoryFilter(category);
    setSubcategoryFilter('All');
  };

  const handleActivityTypeChange = (type: ActivityTypeFilter) => {
    setActivityType(type);
    // Category filters are type-specific, reset them on switch
    setCategoryFilter('All');
    setSubcategoryFilter('All');
  };

  // Sorted by size, ungrouped: day headers are a statement about order, and
  // once the order ignores days they would be scattered one-row bands. The
  // rows carry their own date instead (ExpenseItem's showDate).
  //
  // Signed, not magnitude. `amount` is stored unsigned and the direction lives
  // in `type`, so the comparable value is the money's actual movement: minus
  // for an expense, plus for income - which also puts a refund (an expense
  // with a negative amount) correctly on the income side of the order, since
  // that is money coming back.
  //
  // Sorting by |amount| looked reasonable and was not: it interleaved a 3,000
  // salary with 3,000 of rent as though they were the same event, and on the
  // All tab the biggest thing that happened to you could be either direction
  // with no way to tell from position.
  const signedAmount = (t: Transaction) =>
    (t.type === 'income' ? 1 : -1) * mineAmount(t, currency);
  // Biggest first, in the direction the tab is about: Income counts down from
  // the largest sum received; Expenses and All count up from the largest spend,
  // so All runs from the heaviest expense through to the largest income.
  const amountSorted =
    sortBy === 'amount'
      ? [...filteredTransactions].sort((a, b) =>
          activityType === 'income'
            ? signedAmount(b) - signedAmount(a)
            : signedAmount(a) - signedAmount(b),
        )
      : [];

  // Group transactions by date, newest first WITHIN the day as well as across
  // days. `date` stops at the day, so two things bought on the same day had
  // nothing to order them by and sat in whatever position the array held -
  // groceries added after the butcher appeared underneath it.
  const groupedTransactions = filteredTransactions.reduce((groups, t) => {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
    return groups;
  }, {} as Record<string, Transaction[]>);
  for (const day of Object.values(groupedTransactions)) day.sort(byRecency);

  // Header total: net for All (signed), spending total for Expenses, +total for Income
  const totalCount = filteredTransactions.length;
  const netTotal = filteredTransactions.reduce((sum, t) => {
    const converted = mineAmount(t, currency);
    return t.type === 'income' ? sum + converted : sum - converted;
  }, 0);
  // On All, one signed net hid the two figures people actually came for, and
  // did it in the same grey as the word "transactions". Split, each side takes
  // its own colour. Whole units only: this is a summary line sharing a row with
  // the export button, and it has to survive "1,234.56€ in · 987.65€ out"
  // without wrapping - the cents live on every row below.
  const inTotal = filteredTransactions.reduce(
    (sum, t) => (t.type === 'income' ? sum + mineAmount(t, currency) : sum), 0);
  const outTotal = filteredTransactions.reduce(
    (sum, t) => (t.type === 'income' ? sum : sum + mineAmount(t, currency)), 0);
  // This week's dots. Built from ALL transactions, not the filtered list: the
  // strip answers "have I been logging", and a category filter must not make
  // a logged day look empty.
  const { showWeekStrip, weekDays } = (() => {
    const now = new Date();
    const start = new Date(now);
    // Back up to the configured first day of the week (1 Monday by default).
    start.setDate(now.getDate() - ((now.getDay() - weekStartsOn + 7) % 7));
    start.setHours(0, 0, 0, 0);
    // Shown only while the picker is on the month we are living in.
    //
    // Anchored on TODAY, not on the week's first day: most weeks that contain
    // a 1st begin in the previous month, and testing the week's month hid the
    // strip for the first days of nearly every month - precisely when someone
    // opening the app after a rollover would look for it. On 2 September the
    // week starts 31 August; the strip still belongs on September.
    //
    // The whole-year view is excluded too: "this week" inside a year of rows
    // is a claim about a scale the user is not reading at.
    const inView =
      selectedYear === String(now.getFullYear()) && selectedMonth === String(now.getMonth());
    // The FULL ledger, keyed by date. Two things follow: a category filter
    // cannot make a logged day look empty, and a week straddling a month
    // boundary reads correctly - on 2 September, Monday the 31st shows filled
    // if something was recorded that day, even though August is not on screen.
    const logged = new Set(transactions.map((t) => t.date));
    const todayStr = toDateStr(now);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toDateStr(d);
      return {
        key,
        // First letter of the day's own name, so Italian reads L M M G V S D.
        letter: daysShort()[d.getDay()].charAt(0),
        filled: logged.has(key),
        future: key > todayStr,
        isToday: key === todayStr,
      };
    });
    return { showWeekStrip: inView, weekDays: days };
  })();

  const headerTotal =
    activityType === 'expense' ? (
      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
        <AmountText amount={-netTotal} currency={currency} decimals={0} abbreviate="fit" />
      </span>
    ) : activityType === 'income' ? (
      // Green here too: every row below it is income, and the segment thumb
      // has already glowed green to say so.
      <span style={{ color: 'var(--tone-income)', fontWeight: 600 }}>
        <AmountText sign="+" amount={netTotal} currency={currency} decimals={0} abbreviate="fit" />
      </span>
    ) : (
      <>
        <span style={{ color: 'var(--tone-income)', fontWeight: 600 }}>
          <AmountText amount={inTotal} currency={currency} decimals={0} abbreviate="fit" />
        </span>
        <span> {t('act.in')} · </span>
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
          <AmountText amount={outTotal} currency={currency} decimals={0} abbreviate="fit" />
        </span>
        <span> {t('act.out')}</span>
      </>
    );

  // CSV Export
  // The tab opens filtered - to this month, at least - so "download" meant one
  // thing to the button (the current view) and usually another to the person
  // pressing it (all my data). It asks now, unless the filters are leaving
  // everything on screen anyway, in which case there is nothing to ask.
  //
  // Both scopes go through lib/csv, and so does the Settings export, so the
  // three cannot drift into different dialects (they had: this one used comma
  // decimals and no BOM, the other the opposite).
  const [exportScopeOpen, setExportScopeOpen] = useState(false);

  // ── Selecting several rows at once ───────────────────────────────────────
  //
  // Entered from the header's overflow menu. While it is on, the type switch
  // and the filter bar step aside: changing the period mid-selection would
  // leave rows ticked that are no longer on screen, and a selection you cannot
  // see is how people delete things they never looked at.
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkSourceOpen, setBulkSourceOpen] = useState(false);
  const [tripsOpen, setTripsOpen] = useState(false);
  const [tripAssignOpen, setTripAssignOpen] = useState(false);

  // Newest first, deduped by name: two Formenteras a year apart are one
  // choice here, because assigning to a name is all the write can do. The
  // dates tell them apart on the row.
  const tripOptions = useMemo(() => {
    const seen = new Set<string>();
    return trips.flatMap((tr) =>
      seen.has(tr.name) ? [] : (seen.add(tr.name), [{ name: tr.name, hint: tripDatesLabel(tr, monthsShort()) }]),
    );
  }, [trips]);

  // What the actions will actually touch: the ticked rows that are still in
  // the list. Re-derived from the filtered set every render rather than
  // trusted from the Set, so a row that a sync removed under us cannot be
  // counted in the header or handed to a delete.
  const selectedRows = selectMode ? filteredTransactions.filter((t) => selected.has(t.id)) : [];
  const selectedIds = selectedRows.map((t) => t.id);
  const selectedTotal = selectedRows.reduce((sum, t) => sum + Math.abs(mineAmount(t, currency)), 0);
  // Expenses and income are two different category lists; one selection cannot
  // be filed under both. The bar still offers it and says why on tap.
  const selectedKinds = new Set(selectedRows.map((t) => t.type));

  // Told rather than derived, and cleaned up on unmount: leaving the tab with
  // rows ticked must not leave App believing the dock is still hidden.
  useEffect(() => {
    onSelectModeChange?.(selectMode);
    return () => {
      if (selectMode) onSelectModeChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode]);

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
    setBulkCategoryOpen(false);
    setBulkSourceOpen(false);
    setTripAssignOpen(false);
  };

  /**
   * Show one trip's rows.
   *
   * All years, the travel category and the name as the search term - the trip
   * IS its name in the description, so the filter that finds it is the same
   * one a person would build by hand.
   */
  /**
   * Show one trip, and nothing else.
   *
   * The period goes to every year, and that is not a convenience: a trip's
   * flights are booked months before it is taken, so under any single month
   * the total on screen is a PART of the trip that looks like the whole of
   * it. Widening is the only reading that cannot mislead - and the period
   * chip says so plainly, so narrowing back down stays one tap away.
   *
   * The category filter is deliberately left alone. It used to be set to
   * Travel and the trip name pushed into the SEARCH box, which worked because
   * the name is the prefix - and put two chips on screen for one idea, took
   * the search box hostage, and would have swept up any other row whose
   * description happened to contain the word.
   */
  const showTrip = (key: string) => {
    setActivityType('all');
    setSelectedYear(ALL_YEARS);
    setSelectedMonth('year');
    setSubcategoryFilter('All');
    setTypeFilter('All');
    setSourceFilter('All');
    setCategoryFilter('All');
    setSearchQuery('');
    setTripFilter(key);
  };

  const openTrip = (trip: Trip) => {
    setTripsOpen(false);
    onModalOpenChange?.(false);
    showTrip(trip.key);
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Everything the FILTER holds, not everything the list has painted. The list
  // stops at RENDER_CAP rows; "select all" over that would quietly mean "the
  // first 250 of your 400", delete them, and look like it had finished.
  const allSelected = selectedRows.length > 0 && selectedRows.length === filteredTransactions.length;
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(filteredTransactions.map((t) => t.id)));

  // The filters in force, worded the way they read on screen.
  // Type-filter values stay canonical ('One-off', ...) - App presets and the
  // row filter compare them - so display goes through this map.
  const typeFilterLabel = (v: string) =>
    v === 'One-off' ? t('act.type.oneOff') : v === 'Recurring' ? t('act.type.recurring') : v === 'Imported' ? t('act.type.imported') : v;

  const activeFilters = (() => {
    const bits: string[] = [];
    if (activityType !== 'all') bits.push(activityType === 'expense' ? t('act.expenses') : t('act.income'));
    bits.push(
      selectedYear === ALL_YEARS
        ? t('act.allYears')
        : selectedMonth === 'year'
          ? selectedYear
          : `${monthsShort()[parseInt(selectedMonth, 10)] ?? ''} ${selectedYear}`,
    );
    if (categoryFilter !== 'All') bits.push(categoryFilter);
    if (subcategoryFilter !== 'All') bits.push(subcategoryFilter);
    if (typeFilter !== 'All') bits.push(typeFilterLabel(typeFilter));
    if (sourceFilter !== 'All') bits.push(sources.find((s) => s.id === sourceFilter)?.name ?? t('act.oneSource'));
    if (activeTrip) bits.push(activeTrip.name);
    if (searchQuery) bits.push(`"${searchQuery}"`);
    return bits;
  })();

  const runExport = (scope: 'view' | 'all') => {
    const rows = scope === 'all' ? transactions : filteredTransactions;
    setExportScopeOpen(false);
    if (rows.length === 0) {
      toast.error(t('act.noExport'));
      return;
    }
    downloadTransactionsCsv(
      buildTransactionsCsv(rows, currency, sources, { partnerName }),
      scope === 'all' ? 'tracklylab-transactions' : 'tracklylab-activity',
    );
    toast.success(`Exported ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`);
  };

  const downloadActivity = () => {
    if (filteredTransactions.length === 0) {
      toast.error(t('act.noExport'));
      return;
    }
    if (filteredTransactions.length === transactions.length) {
      runExport('view'); // the view IS everything - nothing to choose between
      return;
    }
    setExportScopeOpen(true);
  };

  // Category list for the filter modal, matching the active type
  const modalCategories =
    activityType === 'income' ? incomeCategories : activityType === 'expense' ? categories : [...categories, ...incomeCategories];

  // Same three-way control as Trend's, in Activity's own order: the label
  // carries the meaning-colour and the thumb's glow repeats it underneath.
  // All is a scope rather than a direction, so it glows neutral.
  const typeOptions: Array<{ value: ActivityTypeFilter; label: string; activeColor: string }> = [
    { value: 'all', label: t('act.all'), activeColor: 'var(--ink)' },
    { value: 'expense', label: t('act.expenses'), activeColor: 'var(--tone-expense)' },
    { value: 'income', label: t('act.income'), activeColor: 'var(--tone-income)' }
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: 'var(--bg-page)' }}>
      {/* Fixed Header - Always Visible */}
      <div className="flex-shrink-0 pt-0" style={{ backgroundColor: 'var(--bg-page)' }}>
        {selectMode ? (
          // Title over meta line, the same two-tier shape the tab's own header
          // uses ("Activity" over "55 transactions · …"). Both tiers are always
          // present: an amount that appears on the first tick and vanishes on
          // the last moved the whole list up and down by a line.
          //
          // The amount is never on its own. A bare figure under a count reads
          // as a stray measurement - it has to say what it is a total OF, the
          // way every other number on this screen does.
          <div className="px-6 pb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                data-sel-done
                onClick={exitSelect}
                aria-label={t('common.done')}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors active:bg-neutral-200"
                style={{ backgroundColor: 'var(--bg-inset)' }}
              >
                <X size={18} style={{ color: 'var(--ink)' }} />
              </button>
              <div className="min-w-0">
                <h1
                  data-sel-count
                  className="truncate"
                  style={{ color: 'var(--ink)', fontSize: '24px', fontWeight: '800', letterSpacing: '-0.6px' }}
                >
                  {selectedRows.length
                    ? t(selectedRows.length === 1 ? 'sel.count.one' : 'sel.count.other', { n: selectedRows.length })
                    : t('sel.none')}
                </h1>
                <p
                  data-sel-total
                  className="truncate"
                  style={{ color: 'var(--ink-2)', fontSize: '13.5px', marginTop: '1px' }}
                >
                  {selectedRows.length ? (
                    <>
                      <AmountText amount={selectedTotal} currency={currency} decimals={2} />
                      {' '}
                      {t('sel.totalOf')}
                    </>
                  ) : (
                    t('sel.hint')
                  )}
                </p>
              </div>
            </div>
            {/* A filled pill, not bare blue text: the X opposite it is a
                filled circle, and a hairline of text across from one reads as
                an afterthought rather than the other half of a pair.
                --wash-accent2 rather than --bg-inset, which is four units off
                the page colour and disappears against it - the same wash the
                ticked rows wear, so the whole mode speaks one colour. */}
            <button
              data-sel-all
              onClick={toggleSelectAll}
              className="flex-shrink-0 rounded-full px-3 py-1.5 transition-opacity active:opacity-60"
              style={{
                backgroundColor: 'var(--wash-accent2)',
                color: 'var(--accent-ink)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {allSelected ? t('sel.clear') : t('sel.all')}
            </button>
          </div>
        ) : (
        <div className="px-6 pb-4 flex items-center justify-between">
          <div className="flex-1">
            <h1 style={{ color: 'var(--ink)', fontSize: '30px', fontWeight: '800', letterSpacing: '-1px' }}>{t('act.title')}</h1>
            <p style={{ color: 'var(--ink-2)', fontSize: '14px', marginTop: '4px' }}>
              {t(totalCount === 1 ? 'act.header.one' : 'act.header.other', { n: totalCount })} · {headerTotal}
            </p>
            {/* This week, one dot a day: filled where something is recorded.
                A quiet nudge to keep logging, not a streak to defend - there
                is no counter and nothing breaks by missing a day.

                Only while the view IS this week's month. On any other period
                "this week" is a claim about a calendar the user is not
                looking at, so the row disappears rather than lie - which also
                means it costs its 24px only where it means something. */}
            {showWeekStrip && (
              <div className="flex gap-2.5 mt-2.5" aria-hidden="true">
                {weekDays.map((d) => (
                  <div key={d.key} className="flex flex-col items-center gap-1">
                    <span style={{ fontSize: 9, fontWeight: 600, color: d.future ? 'var(--ghost)' : 'var(--ink-2)' }}>
                      {d.letter}
                    </span>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        backgroundColor: d.filled ? '#4F74F3' : d.future ? 'transparent' : 'var(--bg-off)',
                        border: d.future ? '1.5px solid var(--bg-off)' : undefined,
                        boxShadow: d.isToday ? '0 0 0 2.5px rgba(79,116,243,0.22)' : undefined,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Export used to be its own button here. It now shares an overflow
              menu with Select: two round buttons side by side on a 390px header
              start crowding the week strip, and neither is an everyday action -
              you export a few times a year and tidy up after an import. */}
          {filteredTransactions.length > 0 && (
            <div className="relative flex-shrink-0">
              <button
                data-act-more
                aria-label={t('act.ariaMore')}
                onClick={() => setMenuOpen((v) => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-full transition-colors active:bg-neutral-200"
                style={{ backgroundColor: 'var(--bg-inset)' }}
              >
                <MoreVertical size={18} style={{ color: 'var(--ink)' }} />
              </button>
              {menuOpen && (
                <>
                  {/* Catches the tap that closes it, including one on the
                      button itself - which would otherwise toggle it back open
                      through the backdrop and leave the menu stuck. */}
                  <div className="fixed inset-0 z-[55]" onClick={() => setMenuOpen(false)} />
                  <div
                    data-act-menu
                    className="absolute right-0 top-11 z-[56] rounded-2xl overflow-hidden"
                    style={{
                      minWidth: 168,
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--line-2)',
                      boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
                    }}
                  >
                    <button
                      data-act-menu-export
                      onClick={() => {
                        setMenuOpen(false);
                        downloadActivity();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-neutral-100"
                      style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500 }}
                    >
                      <Download size={16} style={{ color: 'var(--ink-2)' }} />
                      {t('act.menu.export')}
                    </button>
                    <div style={{ height: 1, backgroundColor: 'var(--line-2)' }} />
                    <button
                      data-act-menu-select
                      onClick={() => {
                        setMenuOpen(false);
                        setSelectMode(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-neutral-100"
                      style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500 }}
                    >
                      <CheckSquare size={16} style={{ color: 'var(--ink-2)' }} />
                      {t('act.menu.select')}
                    </button>
                    {/* Only for someone who has trips. For everyone else the
                        menu is exactly what it was, which is the whole point
                        of putting this here rather than on a screen. */}
                    {/* Shown whenever there is a travel category to file one
                        under, not only once a trip exists. Gating it on
                        having one meant the way to MAKE the first was only
                        reachable by someone who already had one - and a
                        person with none is exactly who needs to be told what
                        a trip is. */}
                    {!!travelCategory && (
                      <>
                        <div style={{ height: 1, backgroundColor: 'var(--line-2)' }} />
                        <button
                          data-act-menu-trips
                          onClick={() => {
                            setMenuOpen(false);
                            setTripsOpen(true);
                            onModalOpenChange?.(true);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-neutral-100"
                          style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500 }}
                        >
                          <Plane size={16} style={{ color: 'var(--ink-2)' }} />
                          {t('act.menu.trips')}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        )}

        {/* All / Expenses / Income type filter. Both this and the filter bar
            below are gone while selecting - see the note on selectMode. */}
        {!selectMode && (<>
        <div className="px-6 pb-3">
          <div className="relative flex p-1 rounded-full" style={{ backgroundColor: 'var(--bg-track)' }}>
            <div
              className="absolute rounded-full"
              style={{
                top: 4, bottom: 4, left: 4, width: 'calc((100% - 8px) / 3)',
                backgroundColor: 'var(--bg-card)',
                boxShadow: switchGlow(activityType === 'all' ? 'all' : activityType),
                transform:
                  activityType === 'expense' ? 'translateX(100%)'
                  : activityType === 'income' ? 'translateX(200%)'
                  : 'translateX(0)',
                transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              aria-hidden="true"
            />
            {typeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleActivityTypeChange(option.value)}
                className="relative flex-1 min-w-0 py-1.5 text-sm font-medium transition-colors"
                style={{ color: activityType === option.value ? option.activeColor : 'var(--ink-2)' }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Bar - Always Visible */}
        <FilterBar
          sortBy={sortBy}
          onToggleSort={() => setSortBy((s) => (s === 'date' ? 'amount' : 'date'))}
          year={selectedYear}
          month={selectedMonth}
          category={categoryFilter}
          subcategory={subcategoryFilter}
          searchQuery={searchQuery}
          typeFilter={typeFilter}
          sourceFilter={sourceFilter}
          sources={sources}
          tripLabel={activeTrip?.name}
          availableYears={availableYears}
          availableMonths={availableMonths}
          onYearChange={(year) => {
            setSelectedYear(year);
            // A month number means nothing spread across every year, and
            // leaving one selected would silently narrow the "all" view.
            if (year === ALL_YEARS) setSelectedMonth('year');
          }}
          onMonthChange={(month) => setSelectedMonth(month)}
          onOpenCategorySelector={() => {
            setIsCategoryModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onOpenSubcategorySelector={() => {
            setIsSubcategoryModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onOpenSourceSelector={() => {
            setIsSourceModalOpen(true);
            onModalOpenChange?.(true);
          }}
          // Only for someone who HAS a trip: a filter for a thing you do not
          // have is a row that only ever says "All".
          onOpenTripSelector={trips.length > 0 ? () => {
            setIsTripModalOpen(true);
            onModalOpenChange?.(true);
          } : undefined}
          onOpenSearch={() => {
            setIsSearchModalOpen(true);
            onModalOpenChange?.(true);
          }}
          onClearSearch={() => setSearchQuery('')}
          onTypeFilterChange={(type) => setTypeFilter(type)}
          onSheetOpenChange={(open) => onModalOpenChange?.(open)}
          onSourceClear={() => setSourceFilter('All')}
          // Clearing a category clears its subcategory too - a subcategory
          // filter with no category behind it matches nothing.
          onCategoryClear={() => { setCategoryFilter('All'); setSubcategoryFilter('All'); }}
          onSubcategoryClear={() => setSubcategoryFilter('All')}
          onTripClear={() => setTripFilter('All')}
        />
        </>)}
      </div>

      {/* Scrollable Transaction List */}
      <div
        ref={listRef}
        onScroll={(e) => {
          if (viewStateRef?.current) viewStateRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        // No top padding: the first day's band sits flush against the filter
        // bar's hairline, so that line reads as the list's top edge. The 8px
        // that was here only showed at rest - it scrolls away with the
        // content - so the gap appeared and vanished for no reason, and under
        // TODAY's tinted band it looked like the tint had stopped short.
        className="flex-1 overflow-y-auto pb-24"
      >
        {sortBy === 'amount' && filteredTransactions.length > 0 ? (
          <div>
            {amountSorted.slice(0, renderLimit).map((transaction) =>
              transaction.type === 'income' ? (
                <IncomeItem
                  key={transaction.id}
                  income={transaction}
                  onTap={onEditTransaction}
                  onDelete={onDeleteTransaction}
                  currency={currency}
                  showDate
                  selectable={selectMode}
                  selected={selected.has(transaction.id)}
                  onToggleSelect={toggleSelect}
                />
              ) : (
                <ExpenseItem
                  key={transaction.id}
                  expense={transaction}
                  onTap={onEditTransaction}
                  onDelete={onDeleteTransaction}
                  currency={currency}
                  showDate
                  badge={sharedBadges?.get(transaction.id) ?? null}
                  selectable={selectMode}
                  selected={selected.has(transaction.id)}
                  onToggleSelect={toggleSelect}
                />
              ),
            )}
            {amountSorted.length > renderLimit && (
              <ShowMoreRows n={amountSorted.length - renderLimit} onClick={() => setRenderLimit((l) => l + RENDER_CAP * 2)} />
            )}
          </div>
        ) : Object.entries(groupedTransactions).length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-neutral-400 text-sm mb-2">{t('act.noTx')}</div>
            <p className="text-neutral-500 text-xs">
              {searchQuery ? t('act.tryDifferent') : t('act.changeFilters')}
            </p>
          </div>
        ) : (
          (() => {
            const sortedDays = Object.entries(groupedTransactions).sort(
              ([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime(),
            );
            // Whole days only: a day group cut in half would misstate its own
            // header total, so the cap rounds up to the day boundary.
            const shown: typeof sortedDays = [];
            let rows = 0;
            for (const entry of sortedDays) {
              shown.push(entry);
              rows += entry[1].length;
              if (rows >= renderLimit) break;
            }
            const hidden = filteredTransactions.length -
              shown.reduce((sum, [, list]) => sum + list.length, 0);
            return (
              <>
                {shown.map(([date, dayTransactions]) => (
                  <ActivityDayGroup
                    key={date}
                    date={date}
                    transactions={dayTransactions}
                    onTransactionTap={onEditTransaction}
                    onDeleteTransaction={onDeleteTransaction}
                    currency={currency}
                    badges={sharedBadges}
                    selectable={selectMode}
                    selectedIds={selected}
                    onToggleSelect={toggleSelect}
                  />
                ))}
                {hidden > 0 && (
                  <ShowMoreRows n={hidden} onClick={() => setRenderLimit((l) => l + RENDER_CAP * 2)} />
                )}
              </>
            );
          })()
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
        categories={modalCategories}
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

      <SourceFilterModal
        isOpen={isSourceModalOpen}
        sources={sources}
        selected={sourceFilter}
        onClose={() => {
          setIsSourceModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onSelect={(value) => {
          setSourceFilter(value);
          setIsSourceModalOpen(false);
          onModalOpenChange?.(false);
        }}
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

      {exportScopeOpen && (
        <ExportScopeModal
          filteredCount={filteredTransactions.length}
          totalCount={transactions.length}
          filters={activeFilters}
          onSelect={runExport}
          onClose={() => setExportScopeOpen(false)}
        />
      )}

      {/* Selection mode: the bar takes the dock's place, and the two pickers
          are the same ones the rest of the app uses. */}
      {selectMode && (
        <ActivitySelectionBar
          count={selectedRows.length}
          onCategory={() => {
            if (selectedKinds.size > 1) {
              toast.error(t('sel.mixed'));
              return;
            }
            setBulkCategoryOpen(true);
            onModalOpenChange?.(true);
          }}
          onSource={() => {
            setBulkSourceOpen(true);
            onModalOpenChange?.(true);
          }}
          onTrip={
            travelCategory
              ? () => {
                  // A trip is spending. An income row cannot wear the travel
                  // category at all, so it would take the name and then not be
                  // in the trip - an edit that looks like it worked.
                  if (selectedKinds.has('income')) {
                    toast.error(t('sel.tripIncome'));
                    return;
                  }
                  setTripAssignOpen(true);
                  onModalOpenChange?.(true);
                }
              : undefined
          }
          onDelete={() => onBulkDelete?.(selectedIds, exitSelect)}
        />
      )}

      {tripAssignOpen && travelCategory && (
        <TripAssignModal
          count={selectedRows.length}
          options={tripOptions}
          travel={travelCategory}
          onClose={() => {
            setTripAssignOpen(false);
            onModalOpenChange?.(false);
          }}
          onApply={(name) => {
            const n = selectedIds.length;
            onBulkTrip?.(selectedIds, name);
            onModalOpenChange?.(false);
            toast.success(
              name
                ? t(n === 1 ? 'sel.inTrip.one' : 'sel.inTrip.other', { n, name })
                : t(n === 1 ? 'sel.outTrip.one' : 'sel.outTrip.other', { n }),
              { duration: 1800 },
            );
            exitSelect();
          }}
        />
      )}

      <TripFilterModal
        isOpen={isTripModalOpen}
        selected={tripFilter}
        trips={trips}
        onSelect={(key) => {
          if (key === 'All') setTripFilter('All');
          else showTrip(key);
          setIsTripModalOpen(false);
          onModalOpenChange?.(false);
        }}
        onClose={() => {
          setIsTripModalOpen(false);
          onModalOpenChange?.(false);
        }}
      />

      {tripsOpen && travelCategory && (
        <TripsSheet
          trips={trips}
          travel={travelCategory}
          currency={currency}
          transactions={transactions}
          amountOf={(tx) => mineAmount(tx, currency)}
          onOpen={openTrip}
          // The same two writes as assigning a selection to a trip: put these
          // rows in a trip called this, take those out of one. The trip has no
          // other identity, so there is nothing else to save.
          onApply={({ assign, name, drop }) => {
            if (assign.length) onBulkTrip?.(assign, name);
            if (drop.length) onBulkTrip?.(drop, null);
          }}
          onClose={() => {
            setTripsOpen(false);
            onModalOpenChange?.(false);
          }}
        />
      )}

      {bulkCategoryOpen && (
        <BulkCategoryModal
          count={selectedRows.length}
          categories={selectedKinds.has('income') ? incomeCategories : categories}
          onClose={() => {
            setBulkCategoryOpen(false);
            onModalOpenChange?.(false);
          }}
          onApply={(category, subcategory) => {
            const n = selectedIds.length;
            onBulkCategory?.(selectedIds, category, subcategory);
            onModalOpenChange?.(false);
            toast.success(
              t(n === 1 ? 'sel.moved.one' : 'sel.moved.other', {
                n,
                name: subcategory ? `${category.name} - ${subcategory}` : category.name,
              }),
              { duration: 1800 },
            );
            exitSelect();
          }}
        />
      )}

      <SourceSelectorModal
        isOpen={bulkSourceOpen}
        sources={assignableSources ?? sources}
        title={t('sel.srcTitle')}
        onClose={() => {
          setBulkSourceOpen(false);
          onModalOpenChange?.(false);
        }}
        onSelect={(sourceId) => {
          const n = selectedIds.length;
          const name = (assignableSources ?? sources).find((s) => s.id === sourceId)?.name ?? '';
          onBulkSource?.(selectedIds, sourceId);
          onModalOpenChange?.(false);
          toast.success(t(n === 1 ? 'sel.onSource.one' : 'sel.onSource.other', { n, name }), {
            duration: 1800,
          });
          exitSelect();
        }}
      />
    </div>
  );
}
