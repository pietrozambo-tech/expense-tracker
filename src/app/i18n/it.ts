import type { en } from './en';

// Italian catalogue. Typed against the English one, so a key added there
// without a translation here fails the typecheck instead of shipping English
// into the Italian app.

export const it: Record<keyof typeof en, string> = {
  // Tab bar. 'Dashboard' and 'Trend' are ordinary loanwords in Italian app UI;
  // translating them ('Cruscotto', 'Tendenza') would read stranger, not
  // clearer.
  'tab.dashboard': 'Dashboard',
  'tab.activity': 'Attività',
  'tab.trend': 'Trend',
  'tab.settings': 'Impostazioni',

  // Onboarding
  'onboarding.title': 'Benvenuto 👋',
  'onboarding.subtitle': 'Registra le tue spese in pochi secondi. Prepariamo tutto.',
  'onboarding.language': 'Lingua',
  'onboarding.name': 'Come ti chiami?',
  'onboarding.namePlaceholder': 'Il tuo nome',
  'onboarding.currency': 'Valuta principale',
  'onboarding.otherCurrencies': 'Altre',
  'onboarding.selectCurrency': 'Scegli la valuta',
  'onboarding.cta': 'Inizia',

  // Settings
  'settings.language': 'Lingua',

  // Dates
  'date.today': 'Oggi',
  'date.yesterday': 'Ieri',

  // Greeting
  'greeting.morning': 'Buongiorno',
  'greeting.afternoon': 'Buon pomeriggio',
  'greeting.evening': 'Buonasera',
  'greeting.night': 'Buonanotte',
  'greeting.welcome': 'Benvenuto 👋',

  // Dashboard chrome
  'dash.periodType.month': 'Mensile',
  'dash.periodType.quarter': 'Trimestrale',
  'dash.periodType.year': 'Annuale',
  'dash.spending': 'Spese',
  'dash.income': 'Entrate',
  'dash.savings': 'Risparmi',
  'dash.savingRate': 'Tasso di Risparmio',
  'seg.expenses': 'Spese',
  'seg.income': 'Entrate',
  'seg.savings': 'Risparmi',
  'dash.empty.title': 'Il tuo primo mese inizia qui',
  'dash.empty.body': 'Registra una spesa appena la fai: questa pagina si riempie da sola.',
  'dash.empty.cta': 'Aggiungi la tua prima spesa',
  'dash.empty.demo': 'Oppure esplora con dati di esempio',

  // Budget bar + nudge
  'budget.title': 'Budget Mensile',
  'budget.of': 'su',
  'budget.overBy': 'Oltre di',
  'budget.underBy': 'Sotto di',
  'budget.onBudget': 'In pari col budget',
  'budget.faster': 'Più veloce del solito',
  'budget.onTrack': 'In linea',
  'budget.pctUsed': '{pct}% usato',
  'budget.dayLeft.one': '{n} giorno rimasto',
  'budget.dayLeft.other': '{n} giorni rimasti',
  'budget.lastDay': 'Ultimo giorno',
  'budget.nudge.title': 'Imposta un budget mensile',
  'budget.nudge.body': 'Fissa un limite mensile per capire come stai andando',
  'budget.nudge.hint': 'Puoi cambiarlo quando vuoi in Impostazioni - Profilo.',
  'budget.nudge.placeholder': 'Quanto al mese?',
  'budget.nudge.save': 'Salva',
  'budget.nudge.cancel': 'Annulla',
  'budget.nudge.aria': 'Imposta un budget mensile',
  'budget.nudge.hide': 'Nascondi il suggerimento budget',

  // Categories card
  'cat.title': 'Categorie',
  'cat.new': 'Nuova',
  'cat.vsAvg': 'vs. Media',
  'cat.emptyExpenses': 'Ancora nessuna spesa',
  'cat.emptyIncome': 'Ancora nessuna entrata',
  'cat.emptyHintExpenses': 'Aggiungi qualche spesa per vedere il dettaglio',
  'cat.emptyHintIncome': 'Aggiungi qualche entrata per vedere il dettaglio',
  'cat.average': 'Media',
  'cat.noTransactions': 'Nessuna transazione per questa selezione.',

  // Cumulative chart
  'chart.cumulative': 'Spesa Cumulata',
  'chart.thisMonth': 'Questo mese',
  'chart.thisQuarter': 'Questo trimestre',
  'chart.thisYear': "Quest'anno",
  'chart.yourUsual': 'Il tuo solito',

  // One-off vs Recurring
  'rec.title': 'Una tantum vs Ricorrenti',
  'rec.oneOff': 'Una tantum',
  'rec.recurring': 'Ricorrenti',
  'rec.back': 'Indietro',
  'rec.allPre': 'Tutti i',
  'rec.allMid': 'erano',

  // Sources card
  'src.spendingTitle': 'Spese per Fonte',
  'src.incomeTitle': 'Entrate per Fonte',
  'src.total': 'Totale',
  'src.noSource': 'Senza fonte',

  // Trend
  'trend.allCategories': 'Tutte le Categorie',
  'trend.allSubcategories': 'Tutte le Sottocategorie',
  'trend.totalSpent': 'Totale Speso',
  'trend.totalEarned': 'Totale Guadagnato',
  'trend.totalSaved': 'Totale Risparmiato',
  'trend.monthlyAverage': 'Media Mensile',
  'trend.thisMonth': 'Questo mese',
  'trend.months': '{n} mesi',
  'trend.tx.one': '{n} transazione',
  'trend.tx.other': '{n} transazioni',
  'trend.noIncome': 'Nessuna entrata registrata',
  'trend.chart.spending': 'Spese Mensili',
  'trend.chart.income': 'Entrate Mensili',
  'trend.chart.savings': 'Risparmi Mensili',
  'trend.noData': 'Nessun dato disponibile',
  'trend.breakdownTitle': 'Dettaglio Mensile',
  'trend.dowTitle': 'Giorno della Settimana',
  'trend.optBreakdown': 'Dettaglio mensile',
  'trend.optDow': 'Giorno della settimana',
  'trend.budgetMark': 'Budget',
  'trend.best': 'Migliore',
  'trend.worst': 'Peggiore',
  'trend.soFar': 'In corso',
  'trend.colAmount': 'Importo',
  'trend.colSaved': 'Risparmiato',
  'trend.colWeight': 'Peso',
  'trend.colCount': 'Numero',
  'trend.colRate': 'Tasso',
  'trend.sortTime': 'Data',
  'trend.other': 'Altro',

  // Day of week card
  'dow.fullYear': 'Tutto il {year}',
  'dow.all': 'Tutte',
  'dow.oneOffs': 'Una tantum',
  'dow.avgPerDay': 'Media / giorno',
  'dow.days': 'Giorni',
  'dow.noSpending': 'Nessuna spesa in questo periodo',
  'dow.outsideRecurring': ' oltre alle ricorrenti',
  'dow.leavingOut.one': 'Esclusa {n} transazione ricorrente',
  'dow.leavingOut.other': 'Escluse {n} transazioni ricorrenti',
  'dow.matchesAll': 'Qui non c’è nulla di ricorrente: questa vista coincide con Tutte.',

  // Monthly average by category
  'tcb.title': 'Media Mensile per Categoria',
  'tcb.share': 'Quota',
  'tcb.avg': 'Media',

  // Period picker sheet
  'ppm.title': 'Vai al periodo',

  // Activity
  'act.title': 'Attività',
  'act.header.one': '{n} transazione',
  'act.header.other': '{n} transazioni',
  'act.all': 'Tutte',
  'act.expenses': 'Spese',
  'act.income': 'Entrate',
  'act.fullYear': "Tutto l'anno",
  'act.type.all': 'Tutte',
  'act.type.oneOff': 'Una tantum',
  'act.type.recurring': 'Ricorrenti',
  'act.type.imported': 'Importate',
  'act.source': 'Fonte',
  'act.noTx': 'Nessuna transazione trovata',
  'act.tryDifferent': 'Prova con un altro termine di ricerca',
  'act.changeFilters': 'Cambia i filtri o aggiungi una transazione',
  'act.noExport': 'Nessuna transazione da esportare',
  'act.oneSource': 'Una fonte',
  'act.subcategory': 'Sottocategoria',
  'act.ariaYear': 'Filtra per anno',
  'act.ariaMonth': 'Filtra per mese',
  'act.ariaType': 'Filtra per tipo',

  // Export scope sheet
  'exp.title': 'Esporta CSV',
  'exp.thisView': 'Questa vista',
  'exp.everything': 'Tutto',
  'exp.noFilters': 'Tutte le transazioni, senza filtri',

  // Search + filter modals
  'search.title': 'Cerca Transazioni',
  'search.placeholder': 'Cerca per descrizione...',
  'search.cta': 'Cerca',
  'fcat.title': 'Filtra per Categoria',
  'fsub.title': 'Filtra per Sottocategoria',
  'fsub.none': 'Nessuna sottocategoria disponibile',
  'fsrc.title': 'Filtra per Fonte',
  'fsrc.all': 'Tutte le fonti',
  'common.close': 'Chiudi',
};
