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
import { myShareOf, runningBalance, shareFraction } from './lib/shared';
import { mergePayloads } from './lib/cloud';
import { planPush, planTombstones, reconcileReplicas, mapCategory, replicaId } from './lib/sharedSync';

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
eq('balance = fronted halves', runningBalance(txns, [], 'EUR'), 480);
eq('settlement retires it', runningBalance(txns, [{ id: 's1', personId: 'p', date: '2026-08-10', amount: 200 }], 'EUR'), 280);

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

// My side publishes only what is mine and shared.
const myLedger = [
  txn({ id: 'a', date: '2026-08-01', description: 'Esselunga', amount: 84, split: { mine: 42 }, updatedAt: '2026-08-01T10:00:00Z' }),
  txn({ id: 'b', date: '2026-08-02', description: 'Coffee', amount: 3 }),
  txn({ id: 'shared-x1', date: '2026-08-03', description: 'Conad', amount: 60, split: { mine: 30 }, fromShared: 'x1' }),
  txn({ id: 'c', date: '2026-08-04', description: 'Salary', amount: 3000, type: 'income', split: { mine: 1500 } }),
];
const pushed = planPush(myLedger, HID, ME);
eq('push: only my own shared expenses', pushed.map((r) => r.id), ['a']);
eq('push: carries the language-independent key', pushed[0].category_key, 'groceries');
eq('push: author_share is my half', pushed[0].author_share, 42);
eq('push: never echoes a replica back', pushed.some((r) => r.id.startsWith('shared-')), false);

// Her rows arrive; mine come back unchanged.
const herRow = {
  id: 'x1', household_id: HID, author_id: HER, payer_id: HER,
  date: '2026-08-03', description: 'Conad', amount: 60, currency: 'EUR',
  base_amount: null, category_key: 'groceries', category_name: 'Spesa',
  category_icon: 'ShoppingCart', subcategory: null, author_share: 30,
  updated_at: '2026-08-03T09:00:00Z', deleted_at: null,
};
const mineEchoed = { ...pushed[0] };

const noReplicas = myLedger.filter((t) => !t.fromShared);
const r1 = reconcileReplicas(noReplicas, [mineEchoed, herRow], ME, CATS);
eq('reconcile: her item becomes a replica', r1.added, 1);
eq('reconcile: my own row is never replicated', r1.transactions.filter((t) => t.fromShared).length, 1);
const rep = r1.transactions.find((t) => t.fromShared === 'x1');
eq('replica: full amount kept', rep.amount, 60);
eq('replica: my share is what she did not cover', rep.split.mine, 30);
eq('replica: id is derived from the shared id', rep.id, replicaId('x1'));

// THE property the spec insists on: running it twice changes nothing.
const r2 = reconcileReplicas(r1.transactions, [mineEchoed, herRow], ME, CATS);
eq('reconcile is idempotent (no adds)', r2.added, 0);
eq('reconcile is idempotent (no updates)', r2.updated, 0);
eq('reconcile is idempotent (same count)', r2.transactions.length, r1.transactions.length);

// Her edit lands without a prompt; her deletion removes the replica.
const herEdited = { ...herRow, amount: 75, author_share: 37.5, updated_at: '2026-08-04T09:00:00Z' };
const r3 = reconcileReplicas(r1.transactions, [mineEchoed, herEdited], ME, CATS);
eq('her edit updates the replica', r3.updated, 1);
eq('her edit moves my share', r3.transactions.find((t) => t.fromShared === 'x1').split.mine, 37.5);
const r4 = reconcileReplicas(r1.transactions, [mineEchoed, { ...herRow, deleted_at: '2026-08-05T09:00:00Z' }], ME, CATS);
eq('her deletion removes the replica', r4.transactions.some((t) => t.fromShared === 'x1'), false);
eq('her deletion is counted', r4.removed, 1);

// Category mapping across languages and inventions.
eq('map: seed id wins', mapCategory(herRow, CATS).id, 'groceries');
eq('map: unknown id falls back to the icon',
  mapCategory({ ...herRow, category_key: 'category-1723480915', category_icon: 'Home' }, CATS).id, 'housing');
eq('map: otherwise a catch-all, never dropped',
  mapCategory({ ...herRow, category_key: 'category-x', category_icon: 'Rocket' }, CATS).id, 'others');

// Tombstones for things I stopped sharing.
eq('tombstone: un-shared row', planTombstones([txn({ id: 'a', date: '2026-08-01', amount: 84 })], [mineEchoed], ME), ['a']);
eq('tombstone: never hers', planTombstones([], [herRow], ME), []);

// The balance is two-sided once replicas exist.
const paired = [
  txn({ id: 'a', date: '2026-08-01', amount: 900, split: { mine: 450 } }),          // I fronted 450 for her
  txn({ id: 'shared-x1', date: '2026-08-03', amount: 60, split: { mine: 30 }, fromShared: 'x1' }), // she fronted 30 for me
];
eq('two-sided balance nets both directions', runningBalance(paired, [], 'EUR'), 420);
eq('settlement retires the net', runningBalance(paired, [{ id: 's', personId: 'p', date: '2026-08-10', amount: 420 }], 'EUR'), 0);
// And her expenses still count as MY spending, at my share.
eq('replica counts as my spending', mineAmount(paired[1], 'EUR'), 30);

if (failed) { console.error(\`\${failed} scenario(s) failed\`); process.exit(1); }
console.log('all shared scenarios passed');
`;

const tmp = mkdtempSync(join(tmpdir(), 'shared-test-'));
try {
  mkdirSync(join(tmp, 'lib'));
  mkdirSync(join(tmp, 'utils'));
  mkdirSync(join(tmp, 'i18n'));
  copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'types.ts'));
  for (const f of ['shared.ts', 'sharedSync.ts', 'cloud.ts', 'fx.ts', 'currencyData.ts', 'supabase.ts']) {
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
