# TracklyLab - Your Expense Lens

Track every expense in seconds - with clear insights into where your money goes.

**Live app:** https://pietrozambo-tech.github.io/expense-tracker/

**Install it like a native app (recommended):** open the link on your iPhone in Safari, tap **Share → Add to Home Screen**. It works offline and updates itself.

---

## Getting started

1. **Onboarding** - enter your name and pick your **main currency**: four quick picks (EUR, USD, GBP, AED) or tap *Others* to search all ~150 world currencies.
2. **Welcome tour** - a 20-second swipe-through of what the app can do.
3. **Try it with sample data** - one tap on the tour (or later in Settings) fills the app with realistic transactions so you can explore every chart immediately. It is added **on top of your own data** and removable in one tap, anytime.
4. **Sign in or stay local** - continue with Google to back up and sync across devices, or use the app fully as a guest (everything stays on your phone).

---

## 📊 Dashboard

Your money at a glance, for any period.

- **Hero card** - Spending (red **-**), Income (green **+**), Savings and Saving Rate for the selected period, with a month / quarter / year selector and arrows to step through time.
- **Monthly budget bar** - set a limit and the month view shows how much of it you have used, with a marker for where you *should* be by today: "75% used · On track", "142% used · Over by 1,357€", and the days left. Haven't set one? An empty bar invites you to add it in a tap - dismiss it and it won't ask again.
- **Categories breakdown** - every category with its share bar and total; sort A-Z or by amount.
- **Dive deep** - tap a category to see its **subcategory breakdown**, then tap any subcategory (or *Other* / *View all*) to open the full **transaction list** behind the number - sortable by time or amount, and you can open and edit any transaction right there. When you save, you land **exactly where you were** (same period, same list).
- **Cumulative spending chart** - how the period's spending built up day by day (weekly/monthly granularity for quarter and year views).
- **One-off vs Recurring** - donut showing how much of your spending repeats.
- **Spending / Income by Source** - donut of which account or card the money moved through.

## 🧾 Activity

Every transaction, in one searchable place.

- **Grouped by day** with per-day net totals, "Today" and "Yesterday" labels.
- **All / Expenses / Income** switch with net or per-type totals in the header.
- **Filters**: year, month, one-off vs recurring, source, category and subcategory - plus **free-text search**.
- **Tap to edit, swipe left to delete.**
- **Foreign-currency rows** show both the converted amount and the original (e.g. `-40.32€` over `-2,500.00₱`).
- **CSV export** of exactly what you filtered - includes date, category, subcategory, source, original currency and amount, and the converted amount, ready for Excel or Sheets.

## ➕ Add a transaction

Designed to take seconds.

- **Amount first**, with a currency chip: the four mains plus a searchable list of ~150 currencies for that dinner in Bangkok.
- **Expense or Income**, description, **date picker** and **recurrence** (see below).
- **Categories in alphabetical order** with icons and colors; selecting one reveals its **subcategories inline**.
- **Source** - which account or card the money moved through, with your default preselected.

## 🔁 Recurring transactions

Set the rent once, never type it again.

- **8 schedules**: every day, work days, weekly, bi-weekly, first of the month, monthly, yearly (or never).
- Occurrences appear **on their scheduled day** - and if you have not opened the app for a while, missed ones are back-filled automatically.
- Editing or deleting a recurring transaction asks the familiar calendar question: **"Only this transaction"** or **"This and future ones"**. Raising the rent from August never rewrites what July recorded.
- Auto-created occurrences say so on their edit screen, so you always know where a transaction came from.

## 📈 Trend

The long view.

- **Expenses / Income / Savings** toggles.
- **Stat cards** - total, monthly average and transaction count for the selected year.
- **Line Trend chart** with a dashed average line.
- **Monthly breakdown** bars with **Best / Worst month** badges - tap a month to jump straight to that month's Dashboard.
- **Filter by category, then by subcategory** - see the trend of just "Travel", or just "Travel > Hotels".
- **Savings view** 🐷 - total saved, saving-rate donut, and the month-by-month savings trend (negative months included).

## ⚙️ Settings

Make it yours.

- **Profile** - your name and an optional **monthly budget** (which drives the Dashboard pace strip); with Google sign-in, your account photo.
- **Categories** - fully editable expense and income categories: 30+ icons, a 22-color palette, unlimited subcategories. Renames update your history; deleting a category safely moves its transactions to *Others*.
- **Sources** - your accounts and cards: a library of 14 banks plus cash, or create custom ones with your own color and monogram. Defaults per direction (expense/income).
- **Main currency** - switch anytime, from all ~150; every chart re-expresses instantly.
- **Support** - send us a message **from inside the app**; we reply by email.
- **Import data** - bring your history from anywhere: a ready-made **AI prompt** (personalized with *your* categories, sources and currency) turns any spreadsheet, bank statement, PDF or even screenshots into a TracklyLab file via ChatGPT/Claude/Gemini. Unmatched rows fall back to *Others* instead of being lost; mixed currencies supported.
- **Export data** - one-tap full backup (transactions, categories, sources, schedules, settings) as a file you own. Restoring it later brings everything back.
- **Load demo data** - the same sample data as the tour, always removable without touching your own records.
- **Danger zone** - *Erase all data* (start fresh, keep your account) vs *Delete account* (remove everything, everywhere) - clearly separated.

## 💱 Multi-currency, done properly

- Spend in any of ~150 currencies; everything is converted to your main currency for totals and charts.
- **Daily exchange rates** with offline fallbacks - and each transaction **locks its rate on its own date**, so past values never drift when markets move.
- Travel week in Japan? Log in ¥, your dashboard stays in €.

## ☁️ Sync, backup and privacy

- **Cloud sync** (with Google sign-in): your data follows you across devices, with an honest status - *Synced · 2m ago*, *Syncing…*, or *Offline - will sync when back online*.
- **Guest mode**: no account needed; everything lives on your device.
- **Your data is yours**: full export anytime, in-app account deletion, and analytics that never include your transactions, amounts or categories.

---

## For testers 🧪

1. Install to your Home Screen (see top).
2. Load the **sample data** and poke every chart - then erase it and start your real tracking.
3. Try the fun paths: a foreign-currency expense, a monthly recurring one, a category dive-deep, the AI import with one of your real spreadsheets.
4. Something odd or missing? **Settings → Support** sends us a message directly from the app.

---

## Development

React 18 + TypeScript + Vite, Tailwind CSS v4, Supabase (auth + sync), PostHog analytics. Deployed to GitHub Pages as a PWA on every push; a Capacitor iOS shell is prepared in-repo (see `CAPACITOR.md`).

```bash
pnpm install
pnpm dev        # local dev server
pnpm build      # production build (PWA)
pnpm preview    # serve the production build
```

App data lives in localStorage under versioned keys (`expense-tracker.v1.*`) with optional cloud sync to Supabase (one JSON record per user, RLS-protected). Storage layer: `src/app/lib/storage.ts` · types: `src/app/types.ts` · backup format: `src/app/lib/backup.ts` · recurrence engine: `src/app/lib/recurrence.ts` · FX engine: `src/app/lib/fx.ts`.

Brought to you by **Zambop** · © TracklyLab
