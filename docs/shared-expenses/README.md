# Shared expenses — design spec

**Status: parked, design complete, no code written.**
Resume when Pietro says go. Nothing in `src/` has been touched for this feature.

Visual spec (every screen, captured from the running app):
<https://claude.ai/code/artifact/c52327a1-1198-4b58-9ae4-91f849b2546d>

This document is the durable record. The artifact holds the pictures; this holds
the decisions, the reasoning, and the parts a cold reader would otherwise have to
re-derive. Read both before writing code.

---

## 1. What this is

Two people, two devices, two accounts, one shared ledger. Pietro and Giulia each
keep their own app; only the expenses they mark as shared cross between them.

**The value is the balance, not the splitting.** This took several rounds to get
right and is the single most important framing in the document:

> Typing `35€` yourself (for a `70€` bill you halved in your head) gives you a
> correct budget and **no record that the other person owes you the other 35**.
> Typing `70` + "half" gives you both from one entry.
>
> **One entry, two outputs**: your spending, and the balance between you.

If the balance is switched off, the feature is close to pointless — you may as
well type your share. That is why balance tracking defaults **on** (§6.1).

---

## 2. The governing rule

**Every screen answers exactly one question, and the amount it shows is the
answer to that question — never a mixture.**

Giulia's 60 € Esselunga run is stored **once** and projected three ways:

| Screen | Question it answers | Her 60 € appears as |
|---|---|---|
| Activity | What did it cost **me**? | **−30.00 €**, her avatar badged on the tile |
| Dashboard · yours | How am **I** doing? | 30 € inside your Groceries |
| Trend | How does **my** spending move? | 30 € in history |
| Dashboard · shared | What do **we** spend? | **60.00 €** (household money) |
| All items | Who owes whom, and why? | **−30.00** (effect on the balance) |

Consequences worth stating explicitly:

- **Her transactions do appear in your Activity**, at your share. A ledger that
  omitted them would disagree with your own Dashboard. An extra **Shared** option
  in Activity's existing filter row narrows to just these.
- **An item whose share is zero for you appears only in the shared view.** It
  cost you nothing, so it has no business in your ledger — but it is still the
  household's money.
- **The shared view never halves anything.** Halving household totals would hide
  what living together actually costs.

---

## 3. Data model

### 3.1 Local (each person's own store)

```ts
/** Reusable split ratio. Attachable to a Source, a Category or a recurring rule
 *  — not just to a transaction. */
export interface SplitRule {
  mode: 'equal' | 'percent';
  ways?: number;        // 'equal', including you
  percent?: number;     // 'percent', yours — 60/40 is common
  withIds?: string[];   // Person ids
}

export interface Person {
  id: string;
  name: string;
  color: string;        // avatar background (hex), like Source.brand
  initials?: string;
  updatedAt?: string;
}

export interface Household {
  id: string;
  name: string;
  memberIds: string[];  // Person ids, not including you
  defaultSplit: SplitRule;
  trackBalance: boolean; // default TRUE — see §6.1
}

// Defaults, configured once:
interface Source        { /* ... */ splitRule?: SplitRule }  // the joint card
interface Category      { /* ... */ splitRule?: SplitRule }  // groceries, utilities
interface RecurringRule { template: { /* ... */ splitRule?: SplitRule } }

interface Transaction {
  // ...unchanged...
  /** Resolved at save time (§5.2). Stored resolved so no reader does lookups and
   *  changing a default never rewrites history. */
  split?: { mine: number; ruleUsed?: SplitRule; paidById?: string };
  /** Set on replicas of the other person's shared items. Read-only in the UI
   *  except for the category (§4.3). */
  fromShared?: string;  // SharedItem id
}
```

**No `myBaseAmount`.** `split.mine` is in the transaction's own currency and the
share is applied to `homeAmount()` as a **ratio** (`mine / amount`). A ratio is
currency-free, so it rides the existing `baseAmount` FX lock instead of needing a
second one. This also means two people with different home currencies never
inherit each other's FX assumptions.

### 3.2 Shared (the household row, server-side)

```ts
interface SharedItem {
  id: string;
  householdId: string;
  authorId: string;     // whose app created it
  payerId: string;      // who actually paid (usually the author)
  date: string;
  description: string;
  amount: number;       // FULL amount
  currency: string;
  categoryKey: string;  // 'groceries' — the seed id, identical in both languages
  categoryHint?: { name: string; icon: string };  // only for invented categories
  subcategory?: string;
  split: SplitRule;
  updatedAt: string;
  deletedAt?: string;
}

interface Settlement {
  id: string;
  householdId: string;
  personId: string;
  date: string;
  amount: number;       // + they paid me, − I paid them
  currency: string;
  baseAmount?: number;
  sourceId?: string;    // which of MY accounts it hit
  note?: string;
  closedBalance: number; // the balance this settlement closed — immutable (§6.3)
  updatedAt?: string;
}
```

Row-level security does the privacy, not the UI: members can read the
household's items; only the author can write theirs. There is no code path that
could leak the rest of a ledger, because the rest of the ledger is never in this
table.

### 3.3 The balance

```
balance = Σ(you fronted for them)
        − Σ(they fronted for you)
        − Σ(they paid you back)
        + Σ(you paid them back)
        ± Σ(adjustments to settled items)   // §6.3
```

Derived at render time. Nothing to migrate, nothing to drift, nothing to
reconcile after a merge.

---

## 4. The category problem (already mostly solved)

### 4.1 The finding

`src/app/components/categories.ts` seeds categories with **stable, semantic
ids**, and `localise()` translates only the *name*:

```ts
groceries: { name: 'Spesa',  subcategories: ['Supermercato'] },
housing:   { name: 'Casa',   subcategories: ['Affitto', 'Bollette', 'Pulizie'] },
```

Giulia's Italian "Spesa" is literally `id: 'groceries'`. **The internal id is
already a language-independent semantic key**, so common categories pair
themselves across accounts with no configuration and no string matching.

### 4.2 Resolution order

1. Her `categoryKey` matches one of your category ids → done. (~90% of cases.)
2. Your saved mapping for her custom category → done.
3. Otherwise → park in a "needs you" list, suggest by **lucide icon name** (also
   language-independent), then by name; file under Others meanwhile so no money
   goes missing from your totals.

Custom categories get `category-${Date.now()}` (`App.tsx:1096`) — meaningless
across accounts, hence step 3.

### 4.3 Ownership split

- **Hers:** amount, date, description, split. Read-only on your device.
- **Yours:** which of *your* categories it lands in. Re-filing it changes nothing
  on her device.

### 4.4 Known edge

`IT_EXPENSE['office-food']` is `null` — the Italian starter set deliberately
drops that category. Share an Office Food item and her app has no home for it, so
it lands in her "needs you" list. The code already tracks this set in
`droppedCategoryIdsFor()`.

---

## 5. The Add screen

### 5.1 The principle

**Sharing is a readout, not a form.** The defaults you set once decide; the
screen states the outcome and lets you override this one entry. So the chip sits
directly **under the amount** — it qualifies the number you just typed
("84, of which 42 is yours").

Rejected placements: the date row (already two controls; sharing is not
scheduling, and a slot there reads as an input), and source-only (see 5.3).

### 5.2 Priority at save — most specific wins

```
this entry's own choice → the recurring rule → the source → the category → not shared
```

The chip **always names which rule fired**, so a surprising split explains itself
on sight.

### 5.3 The four cases — all verified as real screens

| | Source | Category | Chip | Stored |
|---|---|---|---|---|
| A | Cash | Aperitivo (personal) | "Split with Giulia", dashed outline | Not shared until tapped. **Any entry on any source can be split.** |
| B | Cash | Groceries (shared) | "Groceries · shared 50/50 · yours 42€" | Shared — the *category* decided |
| C | Joint card | Aperitivo (personal) | "Joint card · shared 50/50 · yours 42€" | Shared — the *source* overrode a personal category |
| D | Cash | Groceries (shared) | "Not shared · all 84€ yours", with undo | Not shared — you overrode the default |

**The joint card is a shortcut, never a gate.** Cash + split works (case A).

### 5.4 Three chip states — shape carries meaning before you read a word

- **Dashed outline** = available, not on.
- **Filled** = on; names the rule that fired; has an `×` to clear.
- **Solid outline + undo arrow** = a default you deliberately switched off.

Case A is also the one-off/pizza case: tap the dashed chip, divide once, done.

### 5.5 The joint card

A **real Source** (a bank card with a name and a paired-avatar tile), never a
fake "Shared" pseudo-source. Source answers *where the money left from*, and that
has to stay true — the settle sheet's "landed in" depends on it, and so would
bank-feed matching later.

Limitation to keep in mind: TracklyLab sources are labels, not balances, so the
joint card's own balance is not tracked. That stays true here.

---

## 6. Rules that hold the model together

### 6.1 Balance tracking defaults ON

Off exists for exactly one case: a joint account you both fund, where costs are
shared but nothing is ever owed. Off elsewhere makes the feature pointless.

### 6.2 A settlement is not a Transaction

It is its own record type, in its own list, and it never enters a category.

- `mineAmount()` returns **0** for it — it is neither spending nor income.
- In Activity it renders in **neutral `--ink-2`, not green**. Green means income
  in this app; using it would be the same lie in a new place.
- Activity's header gains a quiet third figure: "3,380€ in · 589€ out ·
  **200€ settled**". In/out stay clean; day-band totals ignore it.
- Settlements reduce a **running balance**. No per-item allocation — an earlier
  draft specced allocating across specific transactions oldest-first and it was
  over-built for how people actually pay each other back.

### 6.3 Settlements are immutable checkpoints

You settle at 347 € and she sends the money. If she later corrects a receipt from
*before* that settlement, rewriting history would make an already-transferred
figure retroactively wrong.

So: **a settlement closes the period behind it.** Closed items are never
rewritten. A later correction posts an **adjustment** into the *current* running
balance, as its own line with its own explanation:

```
Adjustment · Conad (July) · Giulia corrected 130.00€ → 145.00€   −7.50
Removed · Aperitivo (July) · Giulia deleted it after you settled  +17.50
```

The July row stays as it was, annotated "corrected since"; a deleted one is
struck through rather than vanishing. Corrections to items in the **open** period
need none of this — the item's own line just changes.

### 6.4 Replicas are rebuilt, never merged

Your copy of her item is derived from the shared stream on every sync rather than
three-way merged. That removes the entire class of conflicts between her edit and
your stale copy — there is nothing of yours to conflict with. It is also what
makes her edits and deletions land without a single prompt.

The reconciler must be **idempotent**: running it twice cannot double anyone's
groceries.

### 6.5 Disconnecting does not delete history

On unlink, replicas freeze into ordinary local transactions. Neither person loses
months of spending because the other left.

---

## 7. Navigation & screens

### 7.1 Where the shared view lives

**The Dashboard**, behind a switcher in the header — not Settings, not a fifth
tab. Three states:

| Condition | Header |
|---|---|
| No household connected | **Identical to today. No switcher at all.** |
| Connected, your view (default) | Two-face pill, your avatar lit, title "Dashboard" |
| Connected, shared view | Two-face pill, her avatar lit, title "Shared" |

**Switcher = option B (decided):** both avatars in one pill, active one lit, other
dimmed at ~30% opacity. A *lone* avatar was rejected — in every app that means
"your account", so it would be tapped by accident and, worse, not tapped by people
who never guess it does anything. A Google/Apple profile photo drops into either
circle; the initial is the fallback.

The dock shows **Dashboard** lit in both views. This is not somewhere else you go.

### 7.2 Months work exactly as everywhere else

An earlier draft invented a "Since 28 Jul" period pill for this view. **Wrong** —
it broke the one navigation habit the app teaches.

The shared view opens with the **same dark hero and the same `‹ August 2026 ›`
chevrons** as the personal Dashboard. "We spent together", the you/her totals and
every card below re-scope per month.

**The balance must ignore months.** A debt does not reset on the 1st; browsing
back to June cannot make her owe a different amount. So it sits in its own card
between the hero and the month-scoped cards, labelled **running**, always
current, with "All items ›" as its way in. Two clocks, one screen: months for
spending, the last settlement for the debt.

### 7.3 Shared view anatomy

1. **Month hero** (dark, mirrors personal) — "We spent together 1,330€", You paid
   / Giulia paid with avatars.
2. **Balance card** — "Giulia owes you 347.00€ · running", Settle up, All items ›.
3. **What we spend** — household totals by category, full amounts. Rows are
   tappable.

### 7.4 Category drill-down

Full household amounts, payer's avatar on each tile, a you/her bar for that
category alone, and a "costs you 130.00€" line in the header. Inherits the shared
view's month, so the numbers always agree with the context you came from. Tapping
a row opens the item sheet (read-only if hers, except the category).

### 7.5 All items

Opened from the **balance card**; its back button returns there. Nothing about it
lives in Settings.

- Compact balance bar at top (the big hero stayed on the Dashboard).
- **Months are groups, not filters** — each a section with its own subtotal
  ("AUGUST · +417.50 to the balance", "JULY · settled · −200.00"). The balance
  runs *through* months until a settlement cuts it.
- Blue raises what she owes you; grey brings it down.
- Settlements and adjustments sit in the same stream.
- Sub-line always states the arithmetic: "You paid 70.00€ · half yours".

### 7.6 Settings → Shared

**Setup only, nothing you read.** Members, default split, always-shared
categories, her categories to map, the balance switch, settlement history,
disconnect.

### 7.7 The nudge

Three tiers, escalating only when the news justifies it. The wording rule: report
**what it did to your numbers**, not that an event occurred.

| Tier | When | What appears | Clears |
|---|---|---|---|
| 1 · dot | Anything new | Indigo dot on her half of the switcher | Opening the shared view |
| 2 · one line | Her entries changed **your** figures this month | Row above the budget bar: "Giulia added 3 shared expenses · +74€ in your August · she owes you 273€ now" | Tapped or dismissed |
| 3 · push | Opt-in, balance events only | System notification | — |

Four rules keep it quiet:

- **Batched** — three entries make one line, not three.
- **Tier 2 only when your numbers moved.** Zero-share item → dot only.
- **Always the balance in the same breath**, with "was 347" beside it.
- **Never a prompt.** Nothing to approve, accept or confirm.

In the shared view the same news appears as a "New since you last looked" group
with NEW markers, folding back into the normal month once seen.

Tiers 1–2 are free — derived from a "last seen" timestamp you need anyway for the
UPDATED badges. **Tier 3 is a separate project** (Capacitor push, APNs certs,
server-side sender); treat it as post-launch.

### 7.8 Her edits in your Activity

The number updates itself; the row carries a quiet **UPDATED** badge until you
have looked. Tapping shows before → after on both her amount and your share, plus
what it did to your category this month and to the balance. Silent would be
wrong; a permission prompt would be worse.

---

## 8. The read funnel and the consumer sweep

One new function, three cases:

```ts
// utils/currency.ts
/** What this transaction actually cost YOU, in the home currency.
 *  Every budget, chart, average and total must use this. */
export function mineAmount(txn, homeCurrency: string): number {
  if (txn.settles?.length) return 0;         // a settlement is not spending
  const paid = homeAmount(txn, homeCurrency);
  if (!txn.split || !txn.amount) return paid;
  return paid * (txn.split.mine / txn.amount);
}
```

| | `homeAmount()` — cash | `mineAmount()` — spending |
|---|---|---|
| Normal expense | 42.00 | 42.00 |
| Shared: paid 70, mine 17.50 | 70.00 | 17.50 |
| Settlement: 52.50 received | 52.50 | **0** |

**Do not rename `homeAmount`** — 60 call sites of churn buys nothing and buries
the real diff.

### Sites to switch `homeAmount` → `mineAmount`

| File | Lines (as of `b15c7a4`) |
|---|---|
| `components/Dashboard.tsx` | 528–529, 930, 934, 1005, 1007, 1035, 1305, 1315, 1366, 1387, 1420, 1452, 1460, 1559, 1563, 1642, 1661, 1668, 1769, 1777, 1783, 1785, 1794, 1796, 1805, 1897, 1933, 1962, 2013, 2061, 3901, 4245–4246, 4858–4859, 5133, 5138 (~35) |
| `components/Activity.tsx` | 274, 297, 306, 308 |
| `components/TrendCategoryBreakdown.tsx` | 50, 61, 69 |
| `components/ActivityDayGroup.tsx` | 62 |
| `lib/usual.ts` | 44 — and `UsualRow` grows `split?` / `settles?` |
| `lib/dayOfWeek.ts` | 98 |

### Stays on `homeAmount` (cash truth / display of the paid figure)

`components/ExpenseItem.tsx:48`, `components/IncomeItem.tsx:57`, `lib/csv.ts:47`.

`BudgetBar` needs **no change** — it takes `spent: number`; only the Dashboard
sum feeding it switches funnels.

`lib/recurrence.ts` (`usualAmount`, `repriceCandidate`, `chargeHistory`) keeps
comparing **full paid amounts**: a rent rise is a rise in the rent, not in your
half.

### Guard it

The repo already has `scripts/test-viewstate.mjs` forcing every `useState` in
Dashboard/Activity to be declared. Same trick: `scripts/test-amount-funnel.mjs`
fails if a file in an analytics allowlist calls `homeAmount` without an explicit
`// cash:` comment. Otherwise this rots the first time someone adds a chart.

---

## 9. Sync, backup, export

- **Transactions** already merge by `updatedAt` LWW → **zero merge changes**.
- **People / Household**: one more `mergeList(...)` call each — both have
  `id` + `updatedAt`, which is exactly what `mergeList` is generic over.
  `BackupFile` gains `people?` / `household?` (optional, so v1 backups restore).
- **Shared items and settlements** live server-side, not in `SyncPayload`.
- **CSV**: add `Paid`, `Your Share`, `Shared With`, `Settles`. Existing
  `Amount (EUR)` becomes the **share** so a plain SUM still gives real spending —
  byte-identical for anyone not using the feature.

### Back-compat

Every new field is optional and every reader falls back: `mineAmount()` with no
`split` ≡ `homeAmount()`. **Existing data reads identically. No migration, no
version bump, no backfill.** An old build editing a shared row preserves unknown
keys (`App.tsx:978` spreads `{ ...expense, ...values }`).

---

## 10. What building this costs

Today `user_data` is a single row per user with RLS and an optimistic version
check. Households need a second, differently-shaped store **beside** it — not a
rewrite of the first.

- **New:** household + shared items + settlements tables; member-scoped reads,
  author-scoped writes.
- **New:** pairing (short-lived code, accept step, consent screen stating exactly
  what becomes visible). The only genuinely new user-facing flow.
- **New:** the reconciler (shared items → local replicas), idempotent.
- **Unchanged:** the existing per-user sync keeps working exactly as it does.

### Build sequence

1. Types + `mineAmount()` + the funnel guard — no UI. Provably identical
   behaviour with no `split` anywhere.
2. Consumer sweep (§8) + tests asserting old fixtures give byte-identical totals.
3. Add-sheet chip (all four cases) + Activity row treatment. Now *useful*:
   honest spending, no balances yet.
4. `Person`, `Household`, share defaults on Source/Category/RecurringRule,
   Settings → Shared.
5. Shared Dashboard view + switcher + drill-down.
6. Balance, All items, settle flow, adjustments.
7. Pairing + reconciler + category mapping (the two-account half).
8. Nudge tiers 1–2.

Steps 1–3 fix the misleading number and are independently shippable. This is also
the argument for building it **before** any bank-feed work: feeds without it
don't just fail to help, they industrialise the error.

---

## 11. Open questions

- **Households of more than two.** The model supports it (`memberIds` is an
  array); every screen is drawn for two. Needs a design pass before claiming it.
- **"I owe them" for non-household friends.** Deliberately out of scope — that is
  a liability, a different surface, and it does not solve the pizza.
- **Push notifications** (nudge tier 3) — separate project.
- **Paywall position.** Shared households is the strongest candidate for the paid
  tier: unlike everything else on the freemium list, a bank feed can never do it
  and a competitor cannot fake it.
- **Does the app have real users yet?** Still unanswered; matters for
  grandfathering.

---

## 12. Rejected, with reasons (do not re-litigate)

| Rejected | Why |
|---|---|
| Per-item settlement allocation | Over-built. People pay against a running balance, not against the rent specifically. |
| "Since 28 Jul" period pill in the shared view | Broke the app's one navigation habit. Months navigate normally; only the balance ignores them. |
| Single-avatar switcher | A lone avatar means "your account" everywhere else. |
| Shared view in Settings | It is read often; Settings holds only what you configure once. |
| Balance tracking off by default | Makes the feature pointless — you may as well type your share. |
| Settlement as income, or as a categorised refund | Dishonest. It is a transfer between money held and money owed. |
| `type: 'reimbursement'` on Transaction | Breaks the binary `type === 'income'` checks scattered through the codebase. |
| Fake "Shared" pseudo-source | Source must keep meaning *where the money left from*. |
| Requiring the joint card to share | Cash + split is the common case (§5.3 case A). |

---

## 12a. What is actually built (audit, August 2026)

Written after the feature shipped and was used on two real phones. The spec
above is the design as agreed; this is the honest state of the code against it,
so nobody has to re-derive it by reading both.

### Built and working

- §3 data model, both local and server-side, including the two-way reconciler.
- §4.1–4.2 step 1: category pairing by seed id, then by lucide icon, then a
  catch-all. Verified across an Italian and an English account.
- §5.1, §5.3 case A/B/D, §5.4: the chip under the amount, three states, any
  source splittable.
- §6.1 balance defaults on. §6.2 settlement is its own record, never a
  Transaction, never categorised. §6.4 replicas rebuilt not merged, idempotent.
  §6.5 disconnect keeps history.
- §7.1–7.3 the switcher, the shared view, the period control (all three lenses,
  no future navigation, the jump-to-period sheet).
- §7.4 category drill-down, and a whole-period item list reached from the
  count beside "What we spend".
- §8 the read funnel, with the guard in `test:shared`.
- §9 sync, backup and CSV export carry the shared fields. Import does not, by
  decision.

### Deliberately different from the spec

- **Switcher.** The spec picked both avatars always (option B). Shipped: one
  face on the personal view, both on the shared one - a later call, on the
  grounds that the pair belongs to the pair's view.
- **Feature gate.** Not in the spec: the whole feature is behind code 4700,
  because it is a candidate for the paid tier (§11).

### Not built

| Spec | What is missing | Cost of the gap |
|---|---|---|
| §5.2 | Only *this entry* and *the category* decide. The **recurring rule** and the **source** rungs of the priority ladder do not exist. | Case C (joint card overrides a personal category) cannot happen. |
| §5.5 | No joint-card Source with a paired-avatar tile. | Follows from the above; sharing is category- or entry-driven only. |
| §4.2 step 2 | No saved mapping for her custom categories, and no "needs you" list. | Her invented categories land in the catch-all silently. |
| §6.3 | Settlements are not checkpoints. A correction to an item from before a settlement moves the running balance with no adjustment line. | The *number* stays right; the *explanation* is missing. |
| §7.5 | The item list is period-scoped, not month-grouped with per-month balance deltas, and it is reached from the category card rather than the balance card. | No reading of how the balance got where it is. |
| §7.7 tiers 1–2 | Changes arrive as toasts. No dot on the switcher, no line above the budget bar, no "New since you last looked" group. | A change seen while the toast is gone leaves no trace. |
| §7.8 | No UPDATED badge in Activity, no before/after. | Her correction changes a number on your screen with nothing marking it. |
| §11 | Households are hard-capped at two, in the database. | As specced for v1. |

### Known issues, not yet decided

- ~~**The balance survives a change of partner.**~~ **Fixed.** The balance is
  scoped to the household's `memberIds`: splits carry `withIds`, settlements
  carry `personId`, and each household mints a fresh Person. Rows written before
  attribution existed are claimed for the household in hand by a one-time
  backfill in `App.tsx`, so nothing changes for an existing pairing and a new one
  starts at zero - which is what the disconnect dialog promised all along.
- ~~**`payer_id` is never set apart from `author_id`.**~~ **Fixed.** The Add
  screen carries a payer toggle beside the share chip; the choice is stored as
  `split.paidByThem`, written to `payer_id`, and read back on the other device.
  Every consumer - the balance, the hero's two columns, the item list, the CSV -
  goes through one `paidByPartner()` helper. With nothing said the author paid,
  so every row written before this reads exactly as it did.
- **Settlement history** appears only in the whole-period item sheet. There is no
  standalone list, and none in Settings (§7.6 asks for one).

---

## 13. Regenerating the mockups

See `mockups/README.md`. They drive the real app in Chromium and inject the
proposed UI into the live DOM, so the type, spacing and tokens are the app's own.
