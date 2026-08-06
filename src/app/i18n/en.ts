// The canonical string catalogue. Keys are added here as screens are
// converted; it.ts must cover every key (its type enforces that), so a new
// string cannot ship half-translated by accident.
//
// Placeholders are {name}-style and replaced by t(); keep them verbatim in
// every translation.

export const en = {
  // Tab bar
  'tab.dashboard': 'Dashboard',
  'tab.activity': 'Activity',
  'tab.trend': 'Trend',
  'tab.settings': 'Settings',

  // Onboarding
  'onboarding.title': 'Welcome 👋',
  'onboarding.subtitle': "Track your expenses in seconds. Let's set things up.",
  'onboarding.language': 'Language',
  'onboarding.name': "What's your name?",
  'onboarding.namePlaceholder': 'Your name',
  'onboarding.currency': 'Main currency',
  'onboarding.otherCurrencies': 'Others',
  'onboarding.selectCurrency': 'Select currency',
  'onboarding.cta': 'Get started',

  // Settings
  'settings.language': 'Language',

  // Dates
  'date.today': 'Today',
  'date.yesterday': 'Yesterday',

  // Greeting
  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',
  'greeting.night': 'Good night',
  'greeting.welcome': 'Welcome 👋',

  // Dashboard chrome
  'dash.periodType.month': 'Monthly',
  'dash.periodType.quarter': 'Quarterly',
  'dash.periodType.year': 'Yearly',
  'dash.spending': 'Spending',
  'dash.income': 'Income',
  'dash.savings': 'Savings',
  'dash.savingRate': 'Saving Rate',
  'seg.expenses': 'Expenses',
  'seg.income': 'Income',
  'seg.savings': 'Savings',
  'dash.empty.title': 'Your first month starts here',
  'dash.empty.body': 'Add an expense as it happens - this page fills in by itself.',
  'dash.empty.cta': 'Add your first expense',
  'dash.empty.demo': 'Or look around with sample data',

  // Budget bar + nudge
  'budget.title': 'Monthly Budget',
  'budget.of': 'of',
  'budget.overBy': 'Over by',
  'budget.underBy': 'Under by',
  'budget.onBudget': 'Right on budget',
  'budget.faster': 'Spending faster than usual',
  'budget.onTrack': 'On track',
  'budget.pctUsed': '{pct}% used',
  'budget.dayLeft.one': '{n} day left',
  'budget.dayLeft.other': '{n} days left',
  'budget.lastDay': 'Last day',
  'budget.nudge.title': 'Set a monthly budget',
  'budget.nudge.body': "Set a monthly limit to track how you're doing",
  'budget.nudge.hint': 'Change it anytime in Settings - Profile.',
  'budget.nudge.placeholder': 'How much per month?',
  'budget.nudge.save': 'Save',
  'budget.nudge.cancel': 'Cancel',
  'budget.nudge.aria': 'Set a monthly budget',
  'budget.nudge.hide': 'Hide budget suggestion',

  // Categories card
  'cat.title': 'Categories',
  'cat.new': 'New',
  'cat.vsAvg': 'vs. Avg',
  'cat.emptyExpenses': 'No expenses yet',
  'cat.emptyIncome': 'No income yet',
  'cat.emptyHintExpenses': 'Start adding expenses to see your breakdown',
  'cat.emptyHintIncome': 'Start adding income to see your breakdown',
  'cat.average': 'Average',
  'cat.noTransactions': 'No transactions found for this selection.',

  // Cumulative chart
  'chart.cumulative': 'Cumulative Spending',
  'chart.thisMonth': 'This month',
  'chart.thisQuarter': 'This quarter',
  'chart.thisYear': 'This year',
  'chart.yourUsual': 'Your usual',

  // One-off vs Recurring
  'rec.title': 'One-off vs Recurring',
  'rec.oneOff': 'One-off',
  'rec.recurring': 'Recurring',
  'rec.back': 'Back',
  'rec.allPre': 'All',
  'rec.allMid': 'was',

  // Sources card
  'src.spendingTitle': 'Spending by Source',
  'src.incomeTitle': 'Income by Source',
  'src.total': 'Total',
  'src.noSource': 'No source',

  // Trend
  'trend.allCategories': 'All Categories',
  'trend.allSubcategories': 'All Subcategories',
  'trend.totalSpent': 'Total Spent',
  'trend.totalEarned': 'Total Earned',
  'trend.totalSaved': 'Total Saved',
  'trend.monthlyAverage': 'Monthly Average',
  'trend.thisMonth': 'This month',
  'trend.months': '{n} months',
  'trend.tx.one': '{n} transaction',
  'trend.tx.other': '{n} transactions',
  'trend.noIncome': 'No income recorded',
  'trend.chart.spending': 'Monthly Spending',
  'trend.chart.income': 'Monthly Income',
  'trend.chart.savings': 'Monthly Savings',
  'trend.noData': 'No data available',
  'trend.breakdownTitle': 'Monthly Breakdown',
  'trend.dowTitle': 'Day of Week',
  'trend.optBreakdown': 'Monthly breakdown',
  'trend.optDow': 'Day of week',
  'trend.budgetMark': 'Budget',
  'trend.best': 'Best',
  'trend.worst': 'Worst',
  'trend.soFar': 'So far',
  'trend.colAmount': 'Amount',
  'trend.colSaved': 'Saved',
  'trend.colWeight': 'Weight',
  'trend.colCount': 'Count',
  'trend.colRate': 'Rate',
  'trend.sortTime': 'Time',
  'trend.other': 'Other',

  // Day of week card
  'dow.fullYear': 'Full {year}',
  'dow.all': 'All',
  'dow.oneOffs': 'One-offs',
  'dow.avgPerDay': 'Avg / day',
  'dow.days': 'Days',
  'dow.noSpending': 'No spending in this period',
  'dow.outsideRecurring': ' outside recurring',
  'dow.leavingOut.one': 'Leaving out {n} recurring transaction',
  'dow.leavingOut.other': 'Leaving out {n} recurring transactions',
  'dow.matchesAll': 'Nothing here is recurring, so this view matches All.',

  // Monthly average by category
  'tcb.title': 'Monthly Average by Category',
  'tcb.share': 'Share',
  'tcb.avg': 'Avg',

  // Period picker sheet
  'ppm.title': 'Jump to period',
} as const;
