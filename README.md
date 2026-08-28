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
- **Select several at once** (⋯ ▸ Select): tick rows, then move them to another
  category and subcategory, put them on an account, put them in a trip (or
  take them out of one), or delete them. Built for the hour after an import,
  when forty rows landed in the catch-all with no account on them - and for
  the taxi you paid in cash that was never in the Tricount. Select all takes everything the *filter* holds, not just the
  rows painted so far; delete asks first with the count and the total, and can
  be undone. When the selection reaches into a recurring schedule it asks once
  whether to stop the schedules too, and says how many later rows that takes.
- **Trips** (⋯ ▸ Trips): every trip in the ledger, each with its total and a
  breakdown by subcategory, tap for its rows. Read out of the descriptions -
  the name an import puts in front of every row (`Azores - Cena porto`) is a
  trip's whole identity, so trips imported months ago appear with no
  migration. Grouped by name **and** by time: two Formentera summers are two
  trips, while the Azores' March flights and August dinners are one. The entry
  only exists for someone who has trips. See `src/app/lib/trips.ts`.
- **Foreign-currency rows** show both the converted amount and the original (e.g. `-40.32€` over `-2,500.00₱`).
- **CSV export** of exactly what you filtered - includes date, category, subcategory, source, original currency and amount, and the converted amount, ready for Excel or Sheets.

## ➕ Add a transaction

Designed to take seconds.

- **Amount first**, with a currency chip: the four mains plus a searchable list of ~150 currencies for that dinner in Bangkok.
- **Expense or Income**, description, **date picker** and **recurrence** (see below).
- **Categories in alphabetical order** with icons and colors; selecting one reveals its **subcategories inline**.
- **Source** - which account or card the money moved through, with your default preselected.

- **Order the category grid** from the pill beside its label: alphabetical (the default, and stable - the tile you want stays where it was) or **Most used**, counted from your whole ledger every time. The choice is remembered, and the schedule editor follows it.

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

Browser checks (real Chromium against the dev server) live in
`scripts/browser/` - see its README for why they are in the repo.

App data lives in localStorage under versioned keys (`expense-tracker.v1.*`) with optional cloud sync to Supabase (one JSON record per user, RLS-protected). Storage layer: `src/app/lib/storage.ts` · types: `src/app/types.ts` · backup format: `src/app/lib/backup.ts` · recurrence engine: `src/app/lib/recurrence.ts` · FX engine: `src/app/lib/fx.ts`.

### Bringing a Tricount trip in

Tricount has no self-service export - its FAQ points you at `support@bunq.com`
and a wait. `scripts/tricount-import.mjs` writes a TracklyLab import file, by
either of two roads.

**From an export** (no network, and the road to prefer):
[tricount-exporter.pages.dev](https://tricount-exporter.pages.dev/) fetches a
trip in your browser and hands you JSON; this converts it.

```bash
node scripts/tricount-import.mjs --from-json azores.json --me "Pit"
```

**From the share link directly**, via the API the app itself uses:

```bash
node scripts/tricount-import.mjs --url <share link> --inspect        # look first
node scripts/tricount-import.mjs --url <share link> --me "Pietro"    # then convert
```

It imports **your share**, not what you paid: fronting €400 for four people is
€100 of spending and €300 of lending, and only the first belongs in a ledger.
Settling up is left out entirely - that is money moving between people.

A trip is filed as **one thing**: every row lands under your travel category,
with the shape of it in the subcategories - taken from the source's own
category where that says something specific, and from the description where it
does not, since "TRAVEL" on a trip export carries no information.

Pass `--categories <your-backup.json>` so those subcategories use **your**
names. Without it the script falls back to the app's seeded names, and if
yours differ the import offers to add them - unticked, so a subcategory you
deliberately deleted does not come back unless you ask for it. With it, a row
whose kind you have no subcategory for is written without one rather than
proposing a new chip. The travel category is found by id, so it works when
yours is called `Viaggi`.

Nothing decisive means no subcategory rather than a guessed one. `--no-trip`
keeps each row's own category instead, for a tricount that is a flatshare
rather than a holiday.

`--trip-name "Azzorre"` prefixes every description ("Azzorre - Cena porto"),
because dates cannot group a trip - most of one is booked months before it is
taken - and a searchable word is the only grouping that survives the next trip
arriving. Pick one spelling and keep it: the name becomes part of each row's
dedupe identity, so re-importing the same trip under a different name would
import it twice. The AI prompt asks for the same name when it detects a trip.

**Loading a trip you are still on.** Import midway and again at the end, with
the whole file the second time - there is no need to wait for the trip to
finish. A row already in the ledger is recognised by date, type, amount,
currency and description and skipped; the import summary says how many, so
only what is new arrives. Two things to know. Spell the trip name identically
both times, because it is part of that identity. And a row *edited in Tricount
after your first import* - a share corrected, somebody added late - carries a
different amount, so it reads as new and lands beside the old figure rather
than replacing it. `--categories <your-backup.json>` compares the file against
what you have already imported and names those rows first:

```
Against your backup: 12 already imported, 9 new, 1 changed.
  2026-03-13  was 60.00 -> now 68.00   Azzorre - Hotel PD Sud
```

Fix or delete the stale row in the app before importing.

Expect a trip to land across several months rather than in the week you took
it - flights, hotels and cars are usually booked long before, and those rows
keep the date the money actually left. The run prints the month breakdown so
that is not a surprise afterwards.

Note the export's `shares` are **costs**. The neighbouring format everyone
assumes - Splitwise - puts **balances** in the same place (paid minus
consumed, signed), so an exported Tricount fed to a converter written for
Splitwise produces wrong numbers that look perfectly reasonable. That includes
the in-app AI import prompt, which describes the Splitwise layout: use this
script for Tricount rather than pasting the export there.

The API is undocumented and mapped from open-source clients, so the script is
built to stop rather than guess: an unrecognised entry type, allocations that
do not add up to their expense, or a name that is not in the trip all end the
run - reported together, with nothing written - instead of producing plausible
wrong numbers. Only `NORMAL` (spending) and `BALANCE` (settling up) are treated
as known; anything else is surfaced to be identified rather than assumed.

It prints your trip total at the end. Check it against the figure Tricount
shows for you before importing. For a second opinion,
[tricount-exporter.pages.dev](https://tricount-exporter.pages.dev/) does the
same fetch entirely in the browser and shows per-person totals - two
independent readings agreeing is about as much assurance as an undocumented
API allows.

`pnpm test:tricount` covers the conversion (even and uneven splits, settling
up, rounds you were not in, foreign currency, the refusals) and round-trips a
converted file through the app's real `buildImport`, including the mid-trip
then full-trip re-import: what is recognised, what a renamed trip does, and the
edited-in-Tricount row that lands twice.

### Edge Functions

Three live in `supabase/functions/`, deployed with `supabase functions deploy <name>`:

| Function | What it does | Secrets |
| --- | --- | --- |
| `send-support` | Emails the in-app Contacts form via Resend | `RESEND_API_KEY` (plus optional `SUPPORT_TO` / `SUPPORT_FROM`) |
| `delete-account` | Erases the caller's data row and auth identity | none |
| `admin-stats` | Daily active / new user counts for the developer screen | `ADMIN_EMAILS` |

`ADMIN_EMAILS` is a comma-separated allow-list checked against the caller's own JWT: `supabase secrets set ADMIN_EMAILS="you@example.com"`. Until it is set the function answers 403 to everyone, including you — it fails closed, because the failure it is guarding against is publishing a user list. The developer screen's unlock code gates a screen, never this data.

All three are called from a browser and handle the CORS preflight themselves. The platform's **Verify JWT** setting can stay on — it only asks whether the token is valid for the project, which is true of every guest of the app — so the functions authenticate their own callers: `delete-account` and `admin-stats` resolve the user from the JWT and refuse without one, and `admin-stats` additionally checks the allow-list.

A function is reachable at `/functions/v1/<slug>`, where the slug is fixed when it is created and cannot be renamed afterwards. Opening that URL in a browser is the quickest way to tell a missing deployment (`404`) from a live one (`405`, from the POST-only guard).

### Counting users

`Settings → developer screen → Users` shows daily active accounts, how many of them were new that day, and the addresses behind them — as stacked bars over 30 days plus a table.

"Active" means **opened the app**, which `auth.users` cannot answer: `last_sign_in_at` holds one timestamp, and a session outlives months of daily use. So the app records it — one row per account per day in `public.app_activity`, written on launch by `src/app/lib/activityPing.ts` (once per device per day, failures swallowed). Run `supabase/schema-activity.sql` once to create the table. Recorded launches start the day it exists — earlier days are recovered by `supabase/schema-activity-backfill.sql`, whose `activity_history()` reads distinct sign-in days out of `auth.audit_log_entries` (granted to `service_role` only). That is a proxy, not a measurement, and the developer screen labels it as one.

New users are a *subset* of that day's actives, never an addition, so the two bar segments sum to the day's total. The owner's own account is excluded by default — a developer opening the app all day would otherwise be the audience — with a toggle to count it. The arithmetic lives inline in `supabase/functions/admin-stats/index.ts`, fenced between `#region aggregate` markers — the dashboard's function editor deploys exactly one file, so an import of a sibling module fails to bundle. `pnpm test:adminstats` lifts that region out and runs it, so the deployable file and the tested code are the same text.

Ideas parked with the thinking already done - costings, blockers, decisions not to build something - live in `ROADMAP.md`.

Brought to you by **Zambop** · © TracklyLab

**Not open source.** This repository is readable so anyone using the app can see how it handles their money and their data — but the code is proprietary and may not be copied, reused, or redistributed. See [LICENSE](LICENSE).
