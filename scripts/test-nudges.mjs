// The nudge engine: which single card (if any) the Dashboard shows.
//
//   pnpm exec node scripts/test-nudges.mjs
//
// Same assembly trick as the other suites: esbuild is only resolvable as a
// binary under .pnpm, not as an import from here.
import { execFileSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('nudges-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const SCENARIOS = `
import { DEFAULT_NUDGE_PREFS, dueNudge, ledgerAgeDays, monthKey, prevMonthKey, untouched } from './lib/nudges';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(\`\${ok ? 'PASS' : 'FAIL'}  \${name}\${ok ? '' : \` (got \${JSON.stringify(got)}, want \${JSON.stringify(want)})\`}\`);
  if (!ok) failed++;
};

// ── untouched: any edit means the user found the screen ────────────────────
const seed = [
  { id: 'groceries', name: 'Groceries', subcategories: ['Supermarket'] },
  { id: 'others', name: 'Others' },
];
eq('untouched: the seeded list, order shuffled, still counts', untouched([seed[1], seed[0]], seed), true);
eq('untouched: a rename counts as touched', untouched([{ ...seed[0], name: 'Food' }, seed[1]], seed), false);
eq('untouched: an added category counts', untouched([...seed, { id: 'x', name: 'X' }], seed), false);
eq('untouched: a removed one counts', untouched([seed[0]], seed), false);
eq('untouched: a new subcategory chip counts',
  untouched([{ ...seed[0], subcategories: ['Supermarket', 'Deli'] }, seed[1]], seed), false);

// ── month arithmetic ───────────────────────────────────────────────────────
eq('prevMonth of January crosses the year', prevMonthKey(new Date(2026, 0, 15)), '2025-12');
eq('monthKey zero-pads', monthKey(new Date(2026, 8, 3)), '2026-09');

// ── dueNudge ───────────────────────────────────────────────────────────────
const NOW = new Date('2026-08-17T12:00:00Z');
// The default state of a new phone: installed nothing, edited nothing, one
// expense on the books.
const base = {
  prefs: { ...DEFAULT_NUDGE_PREFS },
  now: NOW,
  standalone: true,
  mobile: true,
  guest: false,
  txCount: 1,
  ownTxCount: 1,
  // Two days in - the setup checklist's own window.
  ledgerAgeDays: 2,
  hasPrevMonthActivity: false,
  catsUntouched: true,
  sourcesUntouched: true,
  // Set, so the scenarios below isolate the half they are about. The budget's
  // own cases are grouped further down.
  budgetSet: true,
  budgetDeclined: false,
};
const due = (over) => dueNudge({ ...base, ...over, prefs: { ...base.prefs, ...(over.prefs ?? {}) } });
/** Setup finished - all three lines. */
const setUp = { catsUntouched: false, sourcesUntouched: false, budgetSet: true };

eq('a fresh month with history leads with the recap', due({ hasPrevMonthActivity: true }), 'recap');
eq('the recap already seen this month stays quiet',
  due({ hasPrevMonthActivity: true, prefs: { recapSeen: '2026-08' } }), 'customize');
eq('last month\\'s dismissal does not silence THIS month',
  due({ hasPrevMonthActivity: true, prefs: { recapSeen: '2026-07' } }), 'recap');
eq('recap needs something to recap', due({ hasPrevMonthActivity: false }), 'customize');

// ── setup before install ───────────────────────────────────────────────────
// The order that matters: a phone in a browser tab is EVERY new user at
// first, so while install outranked setup the setup tip could not physically
// appear in the days it is about.
eq('a phone in a browser tab is offered setup before installation', due({ standalone: false }), 'customize');
eq('once setup is done the install invitation gets its turn', due({ standalone: false, ...setUp }), 'install');
eq('dismissing the setup tip also lets install through',
  due({ standalone: false, prefs: { customizeDismissed: true } }), 'install');
eq('but never on desktop - the instructions do not exist there',
  due({ standalone: false, mobile: false, ...setUp }), null);
eq('an install dismissal is forever',
  due({ standalone: false, ...setUp, prefs: { installDismissed: true } }), null);
eq('and nothing to install once installed', due({ ...setUp }), null);

// ── the setup checklist ────────────────────────────────────────────────────
eq('factory settings after the first expense: the setup tip', due({}), 'customize');
eq('before the first expense, the empty state is already doing the asking',
  due({ txCount: 0 }), null);
eq('...and install may speak in that gap instead', due({ txCount: 0, standalone: false }), 'install');
// One list touched is half done, not done: this used to need BOTH untouched,
// so renaming a single category silenced the advice about accounts forever.
eq('categories touched, sources still seeded: half a checklist is still due',
  due({ catsUntouched: false }), 'customize');
eq('sources touched, categories still seeded: likewise', due({ sourcesUntouched: false }), 'customize');
eq('both touched: nothing left to say', due({ ...setUp }), null);
eq('customize dismissed: never again', due({ prefs: { customizeDismissed: true } }), null);

// The budget was a second card, lower down the same screen, asking the same
// kind of thing. As a third line it has to be able to hold the card open on
// its own - otherwise merging it would have quietly deleted the offer for
// anyone who had already sorted their categories and accounts.
eq('a missing budget alone keeps the checklist due', due({ ...setUp, budgetSet: false }), 'customize');
eq('a budget set but the lists still seeded: also due', due({ budgetSet: true }), 'customize');
eq('all three done: gone', due({ ...setUp }), null);
// Switching the budget off in Settings answers this question. Folding the
// budget card into the checklist dropped the protection its own card had, so
// saying "no budget" brought a card back asking for a budget - on a Dashboard
// where nothing else was outstanding.
eq('a declined budget cannot hold the card open on its own',
  due({ ...setUp, budgetSet: false, budgetDeclined: true }), null);
eq('but it does not silence the other two',
  due({ budgetSet: false, budgetDeclined: true }), 'customize');
eq('and declining is not the same as having one',
  due({ ...setUp, budgetSet: false, budgetDeclined: false }), 'customize');
eq('one dismissal answers all three, budget included',
  due({ ...setUp, budgetSet: false, prefs: { customizeDismissed: true } }), null);
eq('and install still gets the slot afterwards',
  due({ ...setUp, budgetSet: false, standalone: false, prefs: { customizeDismissed: true } }), 'install');

// ── the checklist expires with its premise ─────────────────────────────────
//
// Reported from a real device: the card appeared for the first time to
// somebody months into using the app, reading as a first-run task list handed
// to a veteran. It had been invisible behind the install banner its whole
// life, so un-hiding it delivered it to everybody at once - including people
// for whom "you have not found these screens yet" is simply untrue.
eq('a month-old ledger still gets the checklist', due({ ledgerAgeDays: 29 }), 'customize');
eq('a ledger older than that does not', due({ ledgerAgeDays: 31 }), null);
eq('and install may have the slot instead',
  due({ ledgerAgeDays: 31, standalone: false }), 'install');
eq('nobody has written a row yet: as new as it gets', due({ ledgerAgeDays: null }), 'customize');
eq('an old ledger does not silence the backup card, which is about loss',
  due({ guest: true, txCount: 40, ownTxCount: 40, standalone: false, ledgerAgeDays: 400 }), 'backup');
eq('nor the recap, which describes the month either way',
  due({ ledgerAgeDays: 400, hasPrevMonthActivity: true }), 'recap');

// ledgerAgeDays itself: written, not dated.
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * 864e5).toISOString();
eq('no rows: null', ledgerAgeDays([], NOW), null);
eq('one row written today', Math.round(ledgerAgeDays([{ createdAt: iso(0) }], NOW)), 0);
eq('the OLDEST row sets the age',
  Math.round(ledgerAgeDays([{ createdAt: iso(3) }, { createdAt: iso(90) }, { createdAt: iso(1) }], NOW)), 90);
// Importing a year of history is a first-afternoon thing to do. Dating the
// ledger by its oldest EXPENSE would read that as a veteran; createdAt is
// stamped at import, so the whole batch is one day old.
eq('a year of history imported yesterday is one day old',
  Math.round(ledgerAgeDays([{ createdAt: iso(1) }, { createdAt: iso(1) }], NOW)), 1);
// Infinity and null both stringify to "null", so these compare identity - a
// row with no stamp must read as OLD, which is the opposite of null's meaning.
eq('a row with no createdAt counts as old, not as new',
  ledgerAgeDays([{ createdAt: iso(1) }, {}], NOW) === Infinity, true);
eq('and an unparseable one too', ledgerAgeDays([{ createdAt: 'whenever' }], NOW) === Infinity, true);
eq('which is not the same as having written nothing', ledgerAgeDays([], NOW) === null, true);

// ── the backup card: a guest ledger with no recent copy ────────────────────
const g = { guest: true, txCount: 40, ownTxCount: 40, standalone: false };
eq('a guest with a real ledger is asked to back up before anything else',
  due({ ...g, hasPrevMonthActivity: true }), 'backup');
eq('signed in, the ledger has a second home - no alarm',
  due({ ...g, guest: false, hasPrevMonthActivity: true }), 'recap');
eq('a small ledger is not worth the alarm', due({ ...g, txCount: 24, ownTxCount: 24 }), 'customize');
eq('a fresh backup buys thirty days of quiet',
  due({ ...g, prefs: { lastBackupAt: new Date(NOW.getTime() - 10 * 864e5).toISOString() } }), 'customize');
eq('a stale one does not',
  due({ ...g, prefs: { lastBackupAt: new Date(NOW.getTime() - 31 * 864e5).toISOString() } }), 'backup');
eq('a dismissal snoozes rather than silences',
  due({ ...g, prefs: { backupSnoozedAt: new Date(NOW.getTime() - 10 * 864e5).toISOString() } }), 'customize');
eq('and the snooze expires after a month',
  due({ ...g, prefs: { backupSnoozedAt: new Date(NOW.getTime() - 31 * 864e5).toISOString() } }), 'backup');

// ── sample data is not work, and cannot be lost ────────────────────────────
//
// The reported case: first run as a guest, tap "load demo data", and the
// backup card fires - telling someone to save a ledger they have not written
// a line of. The demo adds hundreds of rows, so a count of everything on
// screen shot straight past the threshold. The card is about losing WORK, and
// sample data is one tap from being regenerated.
eq('a guest with nothing but demo data is not told to back it up',
  due({ guest: true, txCount: 400, ownTxCount: 0, standalone: false }), 'customize');
// The recap is left alone deliberately: it DESCRIBES what is on the screen,
// and on a demo screen everything is demo - the hero, the charts and the
// recap agree. The backup card is different in kind. It does not describe the
// data, it hands the user a responsibility, and it did so on a false premise.
eq('though the recap still speaks over demo data - it narrates the screen',
  due({ guest: true, txCount: 400, ownTxCount: 0, standalone: false, hasPrevMonthActivity: true }),
  'recap');
eq('nor when a couple of their own rows sit among it',
  due({ guest: true, txCount: 400, ownTxCount: 3, standalone: false }), 'customize');
eq('but a real ledger under the demo still counts',
  due({ guest: true, txCount: 400, ownTxCount: 30, standalone: false }), 'backup');
// The setup checklist reads the OTHER count on purpose: its whole pitch is
// "make the categories yours so the charts stop describing the sample", which
// is exactly the advice a demo-only screen needs.
eq('and the setup tip still speaks over demo data, which is who it is for',
  due({ txCount: 400, ownTxCount: 0 }), 'customize');

// ── the toggles rule them all ──────────────────────────────────────────────
eq('tips off silences the backup card too', due({ ...g, prefs: { tips: false } }), null);
eq('tips off silences install', due({ standalone: false, ...setUp, prefs: { tips: false } }), null);
eq('tips off silences customize', due({ prefs: { tips: false } }), null);
eq('recap off silences the recap but not the tips',
  due({ hasPrevMonthActivity: true, prefs: { recap: false } }), 'customize');

console.log(failed ? \`\\n\${failed} FAILED\` : '\\nAll checks passed.');
process.exit(failed ? 1 : 0);
`;

const tmp = mkdtempSync(join(tmpdir(), 'nudges-test-'));
try {
  mkdirSync(join(tmp, 'lib'));
  copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'types.ts'));
  copyFileSync(join(root, 'src/app/lib/nudges.ts'), join(tmp, 'lib/nudges.ts'));
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
