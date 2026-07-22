# Expense Tracker

A mobile-first expense tracking app: log a transaction in seconds, see where your money goes.

**Live app:** https://pietrozambo-tech.github.io/expense-tracker/

Originally prototyped in [Figma Make](https://www.figma.com/design/qjH5nUgtAFEeE3K71GDmE9/Expense-Tracker), now a standalone PWA. On iPhone: open the link in Safari → Share → **Add to Home Screen** to install it like a native app. Every push to the default branch redeploys via GitHub Actions.

## Features

- **Quick add** — amount, description, date, recurrence, category/subcategory, per-transaction currency
- **Dashboard** — monthly/quarterly/yearly overview, category breakdown, cumulative spending chart, recurring vs one-off split, trend view
- **Expenses & Income lists** — grouped by day, with year/month/category/subcategory filters and search
- **Categories** — fully editable expense and income categories with subcategories and icons
- **Multi-currency** — EUR, USD, GBP, AED with per-transaction currency
- **Local persistence** — everything is stored in the browser's localStorage; no account, no server

## Tech stack

- [Vite](https://vitejs.dev) + React 18 + TypeScript
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) components
- lucide-react icons, sonner toasts
- Self-hosted Inter font (`@fontsource/inter`)

## Development

```bash
pnpm install
pnpm dev       # start dev server
pnpm build     # production build to dist/
pnpm preview   # serve the production build
```

## Data & storage

App data lives in localStorage under versioned keys (`expense-tracker.v1.*`):
transactions, expense categories, income categories, and user settings
(name, main currency, onboarding flag). The storage layer is in
`src/app/lib/storage.ts`; shared data types are in `src/app/types.ts`.

**Backup**: Settings → Backup → *Export data* downloads a JSON file with all
transactions, categories and settings; *Import data* validates and restores
one (with a confirmation, since it overwrites current data). This is the
manual safety net until cloud sync exists. See `src/app/lib/backup.ts`.

**Demo data**: Settings → Data → *Load demo data* fills the app with sample
transactions (date-shifted so the current month is always populated) for
testing. *Erase all data* wipes storage and restarts from onboarding.

There is no backend yet — swapping localStorage for an API later only
requires replacing `src/app/lib/storage.ts`.
