// Shared expenses: the mineAmount funnel, the share arithmetic, the running
// balance, the household singleton merge - plus the funnel guard, which fails
// the build if an analytics file ever reads homeAmount again (that is how the
// split silently stops applying the first time someone adds a chart).
//
//   pnpm test:shared
//
// Same assembly trick as test-usual.mjs: esbuild is only resolvable as a
// binary under .pnpm, not as an import from here.

import { execFileSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── The funnel guard ────────────────────────────────────────────────────────
// These files aggregate SPENDING, so they must read mineAmount. homeAmount is
// cash truth and belongs to row display (ExpenseItem/IncomeItem), the CSV,
// and SharedView's full-amount household totals - never to these.
const FUNNEL_FILES = [
  'src/app/components/Dashboard.tsx',
  'src/app/components/Activity.tsx',
  'src/app/components/TrendCategoryBreakdown.tsx',
  'src/app/components/ActivityDayGroup.tsx',
  'src/app/lib/usual.ts',
  'src/app/lib/dayOfWeek.ts',
];
let guardFailed = false;
for (const f of FUNNEL_FILES) {
  const src = readFileSync(join(root, f), 'utf8');
  if (/\bhomeAmount\s*\(/.test(src)) {
    console.error(`funnel guard: ${f} calls homeAmount() - analytics must read mineAmount()`);
    guardFailed = true;
  }
}
if (guardFailed) process.exit(1);
console.log(`funnel guard: ${FUNNEL_FILES.length} analytics files clean`);

// ── Behaviour tests, against the real modules ───────────────────────────────
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('shared-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const SCENARIOS = `
import { homeAmount, mineAmount } from './utils/currency';
import { byRecency, myShareOf, runningBalance, shareFraction } from './lib/shared';
import { mergePayloads } from './lib/cloud';
import { planSync, mapCategory, paidBy, paidByPartner, pairingChange, replicaId, sharedIdOf } from './lib/sharedSync';
import { buildTransactionsCsv } from './lib/csv';

let failed = 0;
const eq = (name, got, want) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  console.log(\`\${ok ? 'PASS' : 'FAIL'}  \${name}\${ok ? '' : \` (got \${JSON.stringify(got)}, want \${JSON.stringify(want)})\`}\`);
  if (!ok) failed++;
};

// mineAmount: identical to homeAmount without a split - existing data reads
// the same to the cent.
const plain = { amount: 42, currency: 'EUR' };
eq('no split = homeAmount', mineAmount(plain, 'EUR'), homeAmount(plain, 'EUR'));
eq('no split, exact', mineAmount(plain, 'EUR'), 42);

// The share as a ratio over the paid amount.
const shared = { amount: 900, currency: 'EUR', split: { mine: 450 } };
eq('50/50 of 900', mineAmount(shared, 'EUR'), 450);
const third = { amount: 90, currency: 'EUR', split: { mine: 30 } };
eq('1/3 of 90', mineAmount(third, 'EUR'), 30);

// Foreign currency rides the baseAmount FX lock through the ratio: the split
// scales whatever the cash conversion says, with no second locked value.
const foreign = { amount: 100, currency: 'USD', baseAmount: 92, split: { mine: 50 } };
eq('foreign: ratio of the locked value', mineAmount(foreign, 'EUR'), homeAmount(foreign, 'EUR') / 2);

// Degenerate splits never produce NaN.
eq('zero amount', mineAmount({ amount: 0, currency: 'EUR', split: { mine: 0 } }, 'EUR'), 0);
eq('NaN mine falls back to paid', mineAmount({ amount: 10, currency: 'EUR', split: { mine: NaN } }, 'EUR'), 10);

// Share arithmetic.
eq('equal 2 ways', myShareOf(84, { mode: 'equal', ways: 2 }), 42);
eq('equal 3 ways rounds to cents', myShareOf(70, { mode: 'equal', ways: 3 }), 23.33);
eq('percent 40', myShareOf(100, { mode: 'percent', percent: 40 }), 40);
eq('fraction clamps', shareFraction({ mode: 'percent', percent: 150 }), 1);

// Running balance: shared expenses front the partner's half; settlements
// retire it; income and unshared rows never move it.
const txns = [
  { id: 'a', amount: 900, currency: 'EUR', type: 'expense', date: '2026-08-01', split: { mine: 450 } },
  { id: 'b', amount: 60, currency: 'EUR', type: 'expense', date: '2026-08-02', split: { mine: 30 } },
  { id: 'c', amount: 500, currency: 'EUR', type: 'expense', date: '2026-08-03' },
  { id: 'd', amount: 3200, currency: 'EUR', type: 'income', date: '2026-08-01', split: { mine: 1600 } },
];
const P1 = ['p1'];
eq('balance = fronted halves', runningBalance(txns, [], 'EUR', P1), 480);
eq('settlement retires it', runningBalance(txns, [{ id: 's1', personId: 'p1', date: '2026-08-10', amount: 200 }], 'EUR', P1), 280);

// ── A balance belongs to the household that ran it up ───────────────────────
// Turning sharing off and pairing with somebody new used to hand the new
// person the old person's debt: the balance was every shared expense ever,
// minus every settlement ever, with nothing saying who they were with.
const withGiulia = [
  { id: 'g1', amount: 900, currency: 'EUR', type: 'expense', date: '2026-08-01', split: { mine: 450, withIds: ['p-giulia'] } },
  { id: 'shared-g2', amount: 60, currency: 'EUR', type: 'expense', date: '2026-08-02', split: { mine: 30, withIds: ['p-giulia'] }, fromShared: 'g2' },
];
const withMarco = [
  { id: 'm1', amount: 100, currency: 'EUR', type: 'expense', date: '2026-10-01', split: { mine: 50, withIds: ['p-marco'] } },
];
const bothEras = [...withGiulia, ...withMarco];
const oldSettle = [{ id: 's-old', personId: 'p-giulia', date: '2026-09-01', amount: 100 }];
eq('the old household still reads its own balance',
  runningBalance(bothEras, oldSettle, 'EUR', ['p-giulia']), 450 - 30 - 100);
eq('a new partner starts from zero, not from her debt',
  runningBalance(bothEras, oldSettle, 'EUR', ['p-marco']), 50);
eq('and her settlement does not pay down his balance',
  runningBalance(withMarco, oldSettle, 'EUR', ['p-marco']), 50);
// Rows written before attribution existed are claimed by the household in
// hand - App backfills them, and this is the instant before it does.
eq('unstamped history counts, so nothing vanishes mid-migration',
  runningBalance([{ id: 'old', amount: 80, currency: 'EUR', type: 'expense', date: '2026-01-01', split: { mine: 40 } }], [], 'EUR', ['p-anyone']),
  40);

// Household merge: singleton three-way. A side that differs from base spoke;
// newer stamp wins when both did; a disconnect is never resurrected by a
// stale copy.
const H = (stamp, extra = {}) => ({
  id: 'h1', memberIds: ['p1'], defaultSplit: { mode: 'equal', ways: 2 },
  sharedCategoryIds: [], trackBalance: true, updatedAt: stamp, ...extra,
});
const wrap = (household) => ({
  transactions: [], categories: [], incomeCategories: [], sources: [], household,
  settings: { onboarded: true, userName: 'P', currency: 'EUR', hasSeenIntro: true },
});
const base = wrap(H('2026-01-01'));
eq('local edit wins over silent remote',
  mergePayloads(base, wrap(H('2026-02-01', { trackBalance: false })), wrap(H('2026-01-01'))).household.trackBalance,
  false);
eq('remote edit wins over silent local',
  mergePayloads(base, wrap(H('2026-01-01')), wrap(H('2026-02-01', { trackBalance: false }))).household.trackBalance,
  false);
eq('both spoke: newer stamp wins',
  mergePayloads(base, wrap(H('2026-03-01', { trackBalance: false })), wrap(H('2026-02-01'))).household.trackBalance,
  false);
// Absent and null both mean "off" - the merge omits the key entirely so a
// pre-feature payload round-trips byte-identical (the sync poll depends on
// that; see the no-op check in test-sync).
eq('disconnect beats a concurrent edit',
  mergePayloads(base, wrap(null), wrap(H('2026-09-09', { trackBalance: false }))).household ?? null,
  null);
eq('no household anywhere stays absent',
  mergePayloads(null, wrap(null), wrap(null)).household ?? null,
  null);

// People and settlements ride the ordinary list merge.
const withPeople = (p, s) => ({ ...wrap(null), people: p, settlements: s });
const m = mergePayloads(
  withPeople([{ id: 'p1', name: 'Giulia', color: '#7C5CFF' }], []),
  withPeople([{ id: 'p1', name: 'Giulia', color: '#7C5CFF' }], [{ id: 's1', personId: 'p1', date: '2026-08-10', amount: 200 }]),
  withPeople([{ id: 'p1', name: 'Giulia', color: '#7C5CFF' }], [{ id: 's2', personId: 'p1', date: '2026-08-11', amount: 50 }]),
);
eq('settlements union across devices', m.settlements.length, 2);
eq('people dedupe by id', m.people.length, 1);

// ── Pairing: a full two-device exchange, no network ─────────────────────────
const ME = 'user-me';
const HER = 'user-her';
const HID = 'household-1';
const CATS = [
  { id: 'groceries', name: 'Groceries', icon: 'ShoppingCart' },
  { id: 'housing', name: 'Housing', icon: 'Home' },
  { id: 'others', name: 'Others', icon: 'MoreHorizontal' },
];
const txn = (o) => ({ currency: 'EUR', type: 'expense', category: CATS[0], ...o });
const row = (o) => ({
  household_id: HID, author_id: HER, payer_id: HER, date: '2026-08-03', description: 'Conad',
  amount: 60, currency: 'EUR', base_amount: null, category_key: 'groceries', category_name: 'Spesa',
  category_icon: 'ShoppingCart', subcategory: null, author_share: 30,
  updated_by: HER, updated_at: '2026-08-03T09:00:00Z', deleted_at: null, ...o,
});

// Mine goes up; hers comes down; the unshared and the income never travel.
const ledger = [
  txn({ id: 'a', date: '2026-08-01', description: 'Esselunga', amount: 84, split: { mine: 42 }, updatedAt: '2026-08-01T10:00:00Z' }),
  txn({ id: 'b', date: '2026-08-02', description: 'Coffee', amount: 3 }),
  txn({ id: 'c', date: '2026-08-04', description: 'Salary', amount: 3000, type: 'income', split: { mine: 1500 } }),
];
const p1 = planSync(ledger, [], ME, HID, CATS);
eq('push: only my shared expenses', p1.push.map((r) => r.id), ['a']);
eq('push: a brand new row is an insert, not a correction', p1.patch.length, 0);
eq('push: author_share is my half', p1.push[0].author_share, 42);
eq('push: stamped with who changed it', p1.push[0].updated_by, ME);
eq('push: carries the language-independent key', p1.push[0].category_key, 'groceries');

// Her row arrives; my own comes back unchanged and is not re-pushed.
const mineEchoed = { ...p1.push[0] };
const p2 = planSync(ledger, [mineEchoed, row({ id: 'x1' })], ME, HID, CATS);
const rep = p2.transactions.find((t) => t.fromShared === 'x1');
eq('her item becomes a replica', !!rep, true);
eq('replica: full amount kept', rep.amount, 60);
eq('replica: my share is what she did not cover', rep.split.mine, 30);
eq('replica: id derives from the shared id', rep.id, replicaId('x1'));
eq('settled state pushes nothing', p2.push.length + p2.patch.length, 0);
eq('she authored it, so it is flagged incoming', p2.incoming.map((c) => c.kind), ['new']);

// THE property: running it again changes nothing and sends nothing.
const p3 = planSync(p2.transactions, [mineEchoed, row({ id: 'x1' })], ME, HID, CATS);
eq('idempotent: no local change', p3.changed, false);
eq('idempotent: no pushes', p3.push.length + p3.patch.length, 0);
eq('idempotent: same count', p3.transactions.length, p2.transactions.length);

// Postgres returns "+00:00", the client writes "Z". Compared as strings these
// sort against each other and every row looks stale forever.
const pgStamp = row({ id: 'x1', updated_at: '2026-08-03T09:00:00+00:00' });
const p4 = planSync(p2.transactions, [mineEchoed, pgStamp], ME, HID, CATS);
eq('timestamp formats compare as instants', p4.push.length + p4.patch.length, 0);
eq('timestamp formats do not churn state', p4.changed, false);

// SHE corrects MY expense. My device must take her version, not overwrite it.
const myItemHerEdit = { ...mineEchoed, amount: 90, author_share: 45, description: 'Esselunga', updated_by: HER, updated_at: '2026-08-05T09:00:00Z' };
const p5 = planSync(p2.transactions, [myItemHerEdit, row({ id: 'x1' })], ME, HID, CATS);
const mineNow = p5.transactions.find((t) => t.id === 'a');
eq('her correction to my expense is accepted', mineNow.amount, 90);
eq('my share follows her correction', mineNow.split.mine, 45);
eq('and my stale copy is NOT re-pushed over it', [...p5.push, ...p5.patch].some((r) => r.id === 'a'), false);
eq('her correction is reported', p5.incoming.some((c) => c.kind === 'edited'), true);

// I correct HER expense: it must go up, keeping her as the author.
const editedReplica = p2.transactions.map((t) =>
  t.fromShared === 'x1' ? { ...t, amount: 70, split: { mine: 35 }, updatedAt: '2026-08-06T09:00:00Z' } : t);
const p6 = planSync(editedReplica, [mineEchoed, row({ id: 'x1' })], ME, HID, CATS);
const pushedBack = p6.patch.find((r) => r.id === 'x1');
eq('my correction to her expense is pushed', !!pushedBack, true);
// As an UPDATE. Sent as an upsert, RLS refuses it: the insert policy demands
// author_id = auth.uid() and this row is hers. That is the whole "edits do not
// sync" bug, and it is a property of WHICH list the row lands in.
eq('a correction is never sent as an insert', p6.push.length, 0);
eq('authorship does not move', pushedBack.author_id, HER);
eq('her half is recomputed, not swapped', pushedBack.author_share, 35);
eq('and it is stamped as mine', pushedBack.updated_by, ME);

// A tombstone removes it on both sides.
const p7 = planSync(p2.transactions, [mineEchoed, row({ id: 'x1', deleted_at: '2026-08-07T09:00:00Z' })], ME, HID, CATS);
eq('deletion removes the replica', p7.transactions.some((t) => t.fromShared === 'x1'), false);
eq('deletion is reported', p7.incoming.some((c) => c.kind === 'removed'), true);

// Absence is NEVER a deletion: a fresh device pulls, it does not wipe.
const fresh = planSync([], [mineEchoed, row({ id: 'x1' })], ME, HID, CATS);
eq('fresh device adopts both rows', fresh.transactions.length, 2);
eq('fresh device tombstones nothing', fresh.push.length + fresh.patch.length, 0);

// A replica whose remote row has vanished must not be republished as mine:
// toRow has no prior to read the author from and would sign it with my name.
const orphan = planSync(
  [txn({ id: 'shared-gone', fromShared: 'gone', date: '2026-08-05', amount: 20, split: { mine: 10 }, updatedAt: '2026-08-05T09:00:00Z' })],
  [], ME, HID, CATS,
);
eq('an orphaned replica is not republished as mine', orphan.push.length + orphan.patch.length, 0);
eq('and it is not silently dropped either', orphan.transactions.length, 1);

// A category I re-filed stays re-filed.
const refiled = p2.transactions.map((t) => (t.fromShared === 'x1' ? { ...t, category: CATS[1] } : t));
const p8 = planSync(refiled, [mineEchoed, row({ id: 'x1', updated_at: '2026-08-09T09:00:00Z', amount: 66, author_share: 33 })], ME, HID, CATS);
eq('her edit does not undo my re-filing', p8.transactions.find((t) => t.fromShared === 'x1').category.id, 'housing');

// ── What the "while you were away" nudge is built from ──────────────────────
// Nothing I did is ever announced back at me: the nudge exists to explain why
// the numbers moved without me touching anything.
const myEdit = p2.transactions.map((t) => (t.id === 'a' ? { ...t, amount: 100, updatedAt: '2026-08-08T09:00:00Z' } : t));
const p9 = planSync(myEdit, [mineEchoed, row({ id: 'x1' })], ME, HID, CATS);
eq('my own edit is not reported to me', p9.incoming.length, 0);
eq('my own edit still goes up', p9.patch.map((r) => r.id), ['a']);

// The app was closed for a day: she added two and corrected one. All three are
// reported in the one pass that runs on opening.
const away = planSync(
  p2.transactions,
  [
    { ...mineEchoed, amount: 90, author_share: 45, updated_by: HER, updated_at: '2026-08-09T09:00:00Z' },
    row({ id: 'x1' }),
    row({ id: 'x2', description: 'Farmacia', updated_at: '2026-08-09T10:00:00Z' }),
    row({ id: 'x3', description: 'Benzina', updated_at: '2026-08-09T11:00:00Z' }),
  ],
  ME, HID, CATS,
);
eq('everything that happened while away is reported', away.incoming.length, 3);
eq('and each says what it was', away.incoming.map((c) => c.kind).sort(), ['edited', 'new', 'new']);
eq('the new ones actually land in the ledger',
  away.transactions.filter((t) => t.fromShared).length, 3);

eq('sharedIdOf: mine', sharedIdOf({ id: 'a' }), 'a');
eq('sharedIdOf: replica', sharedIdOf({ id: 'shared-x1', fromShared: 'x1' }), 'x1');

// Category mapping across languages and inventions.
eq('map: seed id wins', mapCategory(row({}), CATS).id, 'groceries');
eq('map: unknown id falls back to the icon',
  mapCategory(row({ category_key: 'category-1723480915', category_icon: 'Home' }), CATS).id, 'housing');
eq('map: otherwise a catch-all, never dropped',
  mapCategory(row({ category_key: 'category-x', category_icon: 'Rocket' }), CATS).id, 'others');

// The balance is two-sided once replicas exist.
const paired = [
  txn({ id: 'a', date: '2026-08-01', amount: 900, split: { mine: 450 } }),
  txn({ id: 'shared-x1', date: '2026-08-03', amount: 60, split: { mine: 30 }, fromShared: 'x1' }),
];
eq('two-sided balance nets both directions', runningBalance(paired, [], 'EUR', ['p']), 420);
eq('settlement retires the net', runningBalance(paired, [{ id: 's', personId: 'p', date: '2026-08-10', amount: 420 }], 'EUR', ['p']), 0);
eq('replica counts as my spending', mineAmount(paired[1], 'EUR'), 30);

// ── Newest first, inside a day as well as across days ───────────────────────
// The date field stops at the day, so two things bought on the same day had
// nothing to order them by: groceries added after the butcher sat underneath it.
const carne = txn({ id: 'a', date: '2026-08-14', description: 'carne', amount: 40, createdAt: '2026-08-14T09:00:00Z' });
const groceries = txn({ id: 'b', date: '2026-08-14', description: 'Groceries', amount: 25, createdAt: '2026-08-14T09:05:00Z' });
const yesterday = txn({ id: 'c', date: '2026-08-13', description: 'Old', amount: 5, createdAt: '2026-08-13T09:00:00Z' });
eq('order: the later of two same-day rows comes first',
  [carne, groceries].sort(byRecency).map((t) => t.description), ['Groceries', 'carne']);
eq('order: and it does not depend on the array order it started in',
  [groceries, carne].sort(byRecency).map((t) => t.description), ['Groceries', 'carne']);
eq('order: days still lead',
  [yesterday, carne, groceries].sort(byRecency).map((t) => t.description), ['Groceries', 'carne', 'Old']);

// Editing an old row must not vault it up its own day.
const editedOld = { ...carne, updatedAt: '2026-08-20T12:00:00Z' };
eq('order: an edit does not move a row', [editedOld, groceries].sort(byRecency).map((t) => t.description),
  ['Groceries', 'carne']);
// Rows written before createdAt existed fall back to updatedAt.
const legacyEarly = txn({ id: 'd', date: '2026-08-14', description: 'legacy-early', amount: 1, updatedAt: '2026-08-14T08:00:00Z' });
const legacyLate = txn({ id: 'e', date: '2026-08-14', description: 'legacy-late', amount: 1, updatedAt: '2026-08-14T10:00:00Z' });
eq('order: legacy rows fall back to updatedAt',
  [legacyEarly, legacyLate].sort(byRecency).map((t) => t.description), ['legacy-late', 'legacy-early']);
// And a row with no stamp at all keeps its place rather than jumping.
const bare = txn({ id: 'f', date: '2026-08-14', description: 'bare', amount: 1 });
eq('order: a row with no stamp sinks, it does not lead',
  [bare, groceries].sort(byRecency).map((t) => t.description), ['Groceries', 'bare']);

// A replica is stamped when first seen and does not move when she edits it.
const firstSight = planSync([], [row({ id: 'x1', updated_at: '2026-08-14T09:03:00Z' })], ME, HID, CATS, HER);
const rep1 = firstSight.transactions[0];
eq('order: a replica is stamped on arrival', rep1.createdAt, '2026-08-14T09:03:00.000Z');
const afterHerEdit = planSync(firstSight.transactions,
  [row({ id: 'x1', updated_at: '2026-08-20T18:00:00Z', amount: 99 })], ME, HID, CATS, HER);
eq('order: her later edit does not restamp it',
  afterHerEdit.transactions.find((t) => t.fromShared === 'x1').createdAt, '2026-08-14T09:03:00.000Z');

// ── Entering an expense and paying for it are different acts ────────────────
// payer_id has been in the schema since the first migration and nothing wrote
// it, so "she was at the till, I logged it" was inexpressible.
eq('payer: with nothing said, the author paid', paidByPartner(txn({ id: 'a', amount: 10, split: { mine: 5 } })), false);
eq('payer: a replica defaults to her, as before',
  paidByPartner(txn({ id: 'shared-x', amount: 10, split: { mine: 5 }, fromShared: 'x' })), true);
eq('payer: I can say she paid for one I entered',
  paidByPartner(txn({ id: 'a', amount: 10, split: { mine: 5, paidByThem: true } })), true);
eq('payer: and that I paid for one she entered',
  paidByPartner(txn({ id: 'shared-x', amount: 10, split: { mine: 5, paidByThem: false }, fromShared: 'x' })), false);

// It has to reach the balance, or the toggle is decoration. She entered the
// 60€ shop, I paid for it: she owes me her half, exactly as if I had typed it.
const sheEnteredIPaid = [
  txn({ id: 'shared-x9', date: '2026-08-02', amount: 60, split: { mine: 30, withIds: ['p1'], paidByThem: false }, fromShared: 'x9' }),
];
eq('payer: the balance follows the payer, not the author',
  runningBalance(sheEnteredIPaid, [], 'EUR', ['p1']), 30);
eq('payer: and so do the hero columns', paidBy(sheEnteredIPaid, (t) => t.amount), { mine: 60, theirs: 0 });

// The round trip: what I say goes up as payer_id and comes back meaning the
// same thing on the other device.
const iPaidHers = planSync(
  [txn({ id: 'shared-x1', amount: 60, split: { mine: 30, paidByThem: false }, fromShared: 'x1', updatedAt: '2026-08-09T09:00:00Z' })],
  [row({ id: 'x1' })], ME, HID, CATS, HER,
);
eq('payer: goes up as payer_id', iPaidHers.patch[0].payer_id, ME);
eq('payer: authorship is untouched by it', iPaidHers.patch[0].author_id, HER);
const sheePaidMine = planSync(
  [txn({ id: 'a', amount: 84, split: { mine: 42, paidByThem: true }, updatedAt: '2026-08-09T09:00:00Z' })],
  [], ME, HID, CATS, HER,
);
eq('payer: her paying for my entry goes up as hers', sheePaidMine.push[0].payer_id, HER);
eq('payer: still authored by me', sheePaidMine.push[0].author_id, ME);
// Coming back down, on her device.
const onHerPhone = planSync([], [{ ...sheePaidMine.push[0] }], HER, HID, CATS, ME);
eq('payer: her device reads it as money she fronted',
  paidByPartner(onHerPhone.transactions[0]), false);

// ── Who was actually out of pocket ──────────────────────────────────────────
// The hero's two columns. A replica is a row she authored, so she paid the
// shop; anything else I paid myself. Full amounts, not shares - the question is
// who was down the money at the till.
const fronted = paidBy(
  [
    txn({ id: 'a', amount: 900, split: { mine: 450 } }),
    txn({ id: 'shared-x1', amount: 60, split: { mine: 30 }, fromShared: 'x1' }),
    txn({ id: 'shared-x2', amount: 40, split: { mine: 20 }, fromShared: 'x2' }),
    txn({ id: 'plain', amount: 500 }),
    txn({ id: 'inc', amount: 3000, type: 'income', split: { mine: 1500 } }),
  ],
  (t) => t.amount,
);
eq('paid: mine is what I fronted, at full value', fronted.mine, 900);
eq('paid: theirs is every replica', fronted.theirs, 100);
eq('paid: unshared and income are not household money', fronted.mine + fronted.theirs, 1000);
// The two columns must reconcile with the balance, or the hero and the card
// below it tell different stories about the same month.
const heroTxns = [
  txn({ id: 'a', amount: 900, split: { mine: 450 } }),
  txn({ id: 'shared-x1', amount: 60, split: { mine: 30 }, fromShared: 'x1' }),
];
const heroPaid = paidBy(heroTxns, (t) => t.amount);
eq('paid: columns sum to the household total', heroPaid.mine + heroPaid.theirs, 960);
eq('paid: and agree with the balance', runningBalance(heroTxns, [], 'EUR', ['p1']), 450 - 30);

// ── Reading a departure off the membership list ─────────────────────────────
// Nobody announces leaving: the row is just gone. One member therefore means
// two opposite things, and only the memory of having had a partner separates
// them.
const meSeat = { userId: ME };
const herSeat = { userId: HER };
eq('pairing: alone and never paired = still waiting', pairingChange([meSeat], ME, false), 'unchanged');
eq('pairing: she appears = joined', pairingChange([meSeat, herSeat], ME, false), 'joined');
eq('pairing: she is still there = nothing to say', pairingChange([meSeat, herSeat], ME, true), 'unchanged');
eq('pairing: her seat is empty = she left', pairingChange([meSeat], ME, true), 'left');
// The trap that made this worth extracting: an empty list (a household read
// back before any membership row lands) must not be read as a departure by a
// device that was never paired.
eq('pairing: empty list, never paired', pairingChange([], ME, false), 'unchanged');
eq('pairing: empty list after pairing = left', pairingChange([], ME, true), 'left');
// A blank id is not a person.
eq('pairing: a blank member id is nobody', pairingChange([meSeat, { userId: '' }], ME, true), 'left');

// ── The spreadsheet export carries the shared facts ─────────────────────────
// A row must say what it cost YOU (so a plain SUM is still spending), what it
// cost the household, who fronted it, and - for settlements - the money that
// moved without being spending at all.
const csv = buildTransactionsCsv(
  [
    txn({ id: 'a', date: '2026-08-01', amount: 900, description: 'Rent', split: { mine: 450 }, category: { id: 'housing', name: 'Housing' }, subcategory: 'Rent' }),
    txn({ id: 'shared-x1', date: '2026-08-03', amount: 60, description: 'Market', split: { mine: 30 }, fromShared: 'x1', category: { id: 'groceries', name: 'Groceries' } }),
    txn({ id: 'c', date: '2026-08-05', amount: 12, description: 'Coffee', category: { id: 'food', name: 'Food' } }),
  ],
  'EUR',
  [],
  { partnerName: 'Giulia', settlements: [{ id: 's', personId: 'p1', date: '2026-08-10', amount: 420 }] },
);
const lines = csv.replace('\\ufeff', '').trim().split('\\r\\n');
const head = lines[0].split(',');
const col = (name) => head.indexOf(name);
const cell = (rowIdx, name) => lines[rowIdx].split(',')[col(name)];
eq('csv: shared columns exist', [
  col('Shared Total (EUR)') > 0, col('Shared With') > 0, col('Paid By') > 0, col('Settled (EUR)') > 0,
], [true, true, true, true]);
// Newest first: settlement 08-10, coffee 08-05, replica 08-03, rent 08-01.
eq('csv: settlement is neither spending nor income', cell(1, 'Amount (EUR)'), '0.00');
eq('csv: settlement carries the money that moved', cell(1, 'Settled (EUR)'), '420.00');
eq('csv: my share is the amount column', cell(4, 'Amount (EUR)'), '-450.00');
eq('csv: the household figure rides beside it', cell(4, 'Shared Total (EUR)'), '900.00');
eq('csv: I fronted my own row', cell(4, 'Paid By'), 'You');
eq('csv: a replica was fronted by them', cell(3, 'Paid By'), 'Giulia');
eq('csv: replica share', cell(3, 'Amount (EUR)'), '-30.00');
eq('csv: unshared rows leave the shared columns empty', [
  cell(2, 'Shared Total (EUR)'), cell(2, 'Shared With'), cell(2, 'Paid By'), cell(2, 'Settled (EUR)'),
], ['', '', '', '']);
eq('csv: unshared amount is untouched', cell(2, 'Amount (EUR)'), '-12.00');

if (failed) { console.error(\`\${failed} scenario(s) failed\`); process.exit(1); }
console.log('all shared scenarios passed');
`;

const tmp = mkdtempSync(join(tmpdir(), 'shared-test-'));
try {
  mkdirSync(join(tmp, 'lib'));
  mkdirSync(join(tmp, 'utils'));
  mkdirSync(join(tmp, 'i18n'));
  copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'types.ts'));
  for (const f of ['shared.ts', 'sharedSync.ts', 'cloud.ts', 'csv.ts', 'fx.ts', 'currencyData.ts', 'supabase.ts']) {
    copyFileSync(join(root, 'src/app/lib', f), join(tmp, 'lib', f));
  }
  copyFileSync(join(root, 'src/app/utils/currency.ts'), join(tmp, 'utils/currency.ts'));
  copyFileSync(join(root, 'src/app/i18n/store.ts'), join(tmp, 'i18n/store.ts'));
  // cloud.ts imports the supabase client, which wants env config at import
  // time - stub it, the merge under test never touches the network.
  writeFileSync(join(tmp, 'lib/supabase.ts'), 'export const supabase = null;\n');
  writeFileSync(join(tmp, 'scenarios.ts'), SCENARIOS);

  const bundle = join(tmp, 'scenarios.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scenarios.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });

  execFileSync(process.execPath, [bundle], { stdio: 'inherit' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
