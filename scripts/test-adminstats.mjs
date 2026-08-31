// The developer dashboard's arithmetic: who counts as active, who counts as
// new, and whose visits are left out.
//
//   pnpm exec node scripts/test-adminstats.mjs
//
// The arithmetic lives inline in the Edge Function - the Supabase dashboard
// editor deploys exactly one file, so an import of a sibling module fails to
// bundle. It is fenced between "#region aggregate" markers, and this suite
// lifts that region out and runs it directly: one source of truth, deployable
// by paste and testable without a deploy.
import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('adminstats-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const SCENARIOS = `
import { aggregate, aggregateAiSpend, windowDays } from './aggregate';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(\`\${ok ? 'PASS' : 'FAIL'}  \${name}\${ok ? '' : \` (got \${JSON.stringify(got)}, want \${JSON.stringify(want)})\`}\`);
  if (!ok) failed++;
};

const TODAY = new Date('2026-08-19T10:00:00Z');
const d = (n) => windowDays(TODAY, 40)[n]; // d(0) today, d(1) yesterday, ...

eq('the window is newest-first and today-inclusive', [d(0), d(1)], ['2026-08-19', '2026-08-18']);
eq('and crosses a month boundary correctly', windowDays(new Date('2026-03-02T00:00:00Z'), 3),
  ['2026-03-02', '2026-03-01', '2026-02-28']);

const acct = (id, email, created) => ({ id, email, createdAt: created + 'T09:00:00.000Z' });
const OWNER = acct('u-owner', 'owner@tracklylab.com', d(20));
const ADA = acct('u-ada', 'ada@example.com', d(0));      // signed up today
const GRACE = acct('u-grace', 'grace@example.com', d(3));  // an older account
const LINUS = acct('u-linus', 'linus@example.com', d(1));  // signed up yesterday

const run = (opens, over = {}) => aggregate({
  accounts: [OWNER, ADA, GRACE, LINUS],
  opens,
  today: TODAY,
  days: 30,
  excludeIds: new Set(['u-owner']),
  ...over,
});

// ── active vs new ──────────────────────────────────────────────────────────
{
  const r = run([
    { userId: 'u-ada', day: d(0) },
    { userId: 'u-grace', day: d(0) },
    { userId: 'u-linus', day: d(1) },
  ]);
  eq('today counts everyone who opened it', r.days[0].active, 2);
  eq('and the ones born today are the new ones', r.days[0].new, 1);
  eq('new plus returning is exactly the day total', r.days[0].new + r.days[0].returning, r.days[0].active);
  eq('yesterday keeps its own count', r.days[1].active, 1);
  eq("yesterday's sign-up counts as new THAT day", r.days[1].new, 1);
  eq('a day nobody opened reads zero, it does not vanish', r.days[2].active, 0);
  eq('new accounts lead the address list',
    r.days[0].emails, ['ada@example.com', 'grace@example.com']);
  eq('and the new ones are separable', r.days[0].newEmails, ['ada@example.com']);
}

// ── the same person twice is one person ────────────────────────────────────
{
  const r = run([
    { userId: 'u-grace', day: d(0) },
    { userId: 'u-grace', day: d(0) },
    { userId: 'u-grace', day: d(0) },
  ]);
  eq('three opens by one account is one active user', r.days[0].active, 1);
  eq('and one address, not three', r.days[0].emails, ['grace@example.com']);
}

// ── the owner's own visits ─────────────────────────────────────────────────
{
  const opens = [{ userId: 'u-owner', day: d(0) }, { userId: 'u-ada', day: d(0) }];
  const r = run(opens);
  eq("the owner's own opens are not an audience", r.days[0].active, 1);
  eq('and the owner is not counted among the accounts', r.totals.accounts, 3);
  eq('but the exclusion is reported, not hidden', r.totals.excluded, 1);
  const withSelf = aggregate({ accounts: [OWNER, ADA, GRACE, LINUS], opens, today: TODAY, days: 30 });
  eq('asked to include them, they count', withSelf.days[0].active, 2);
}

// ── totals ─────────────────────────────────────────────────────────────────
{
  const r = run([
    { userId: 'u-ada', day: d(0) },
    { userId: 'u-grace', day: d(0) },
    { userId: 'u-grace', day: d(2) },
    { userId: 'u-linus', day: d(6) },
    { userId: 'u-grace', day: d(9) },
  ]);
  eq('today reads off the first day', [r.totals.activeToday, r.totals.newToday], [2, 1]);
  eq('the 7-day figure counts PEOPLE, not visits', r.totals.active7, 3);
  eq('sign-ups in the last 7 days', r.totals.new7, 3);
  eq('and in the last 30', r.totals.new30, 3);
}

// ── an account created but never opened still signed up ────────────────────
{
  const r = run([]);
  eq('a sign-up that never opened is still new today', r.totals.newToday, 0);
  eq('and still counts in the 7-day sign-ups', r.totals.new7, 3);
  eq('while daily actives stay honestly empty', r.totals.activeToday, 0);
}

// ── rows that cannot be trusted ────────────────────────────────────────────
{
  const r = run([
    { userId: 'u-ghost', day: d(0) },      // a deleted account's leftover row
    { userId: 'u-ada', day: '2019-01-01' }, // outside the window
  ]);
  eq('an open by an account that no longer exists is ignored', r.days[0].active, 0);
  eq('and an out-of-window day never lands anywhere', r.days.every((x) => x.active === 0), true);
}

// ── the AI import's burn, by day ──────────────────────────────────────────
{
  const r = aggregateAiSpend([
    { day: '2026-08-19', conversions: 2, tokens_in: 10000, tokens_out: 4000 },
    { day: '2026-08-19', conversions: 1, tokens_in: 5000, tokens_out: 1000 },
    { day: '2026-08-18', conversions: 1, tokens_in: 700, tokens_out: 300 },
  ]);
  eq('two accounts on one day sum into one line',
    r[0], { day: '2026-08-19', conversions: 3, tokensIn: 15000, tokensOut: 5000, users: 2 });
  eq('newest day first', r.map((x) => x.day), ['2026-08-19', '2026-08-18']);
  eq('one account alone still counts itself', r[1].users, 1);
  // PostgREST hands bigint columns over as strings; the sum must not become
  // "07000" concatenation.
  const s2 = aggregateAiSpend([{ day: '2026-08-19', conversions: 1, tokens_in: '7000', tokens_out: '2000' }]);
  eq('bigints arriving as strings are numbers by the time they are summed',
    [s2[0].tokensIn, s2[0].tokensOut], [7000, 2000]);
  eq('no usage is an empty list, not a crash', aggregateAiSpend([]), []);
}

console.log(failed ? \`\\n\${failed} FAILED\` : '\\nAll checks passed.');
process.exit(failed ? 1 : 0);
`;

const tmp = mkdtempSync(join(tmpdir(), 'adminstats-test-'));
try {
  const fn = readFileSync(join(root, 'supabase/functions/admin-stats/index.ts'), 'utf8');
  const start = fn.indexOf('// #region aggregate');
  const end = fn.indexOf('// #endregion aggregate');
  if (start === -1 || end === -1) {
    console.error('adminstats-test: the "#region aggregate" fence is gone from index.ts - the arithmetic it guards is no longer under test');
    process.exit(1);
  }
  writeFileSync(join(tmp, 'aggregate.ts'), fn.slice(start, end));
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
