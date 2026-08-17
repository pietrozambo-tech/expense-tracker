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
import { DEFAULT_NUDGE_PREFS, dueNudge, monthKey, prevMonthKey, untouched } from './lib/nudges';

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
const THREE_DAYS_AGO = new Date(NOW.getTime() - 3 * 864e5).toISOString();
const base = {
  prefs: { ...DEFAULT_NUDGE_PREFS, onboardedAt: THREE_DAYS_AGO },
  now: NOW,
  standalone: true,
  mobile: true,
  hasPrevMonthActivity: false,
  catsUntouched: true,
  sourcesUntouched: true,
};
const due = (over) => dueNudge({ ...base, ...over, prefs: { ...base.prefs, ...(over.prefs ?? {}) } });

eq('a fresh month with history leads with the recap', due({ hasPrevMonthActivity: true, standalone: false }), 'recap');
eq('the recap already seen this month stays quiet',
  due({ hasPrevMonthActivity: true, prefs: { recapSeen: '2026-08' } }), 'customize');
eq('last month\\'s dismissal does not silence THIS month',
  due({ hasPrevMonthActivity: true, prefs: { recapSeen: '2026-07' } }), 'recap');
eq('recap needs something to recap', due({ hasPrevMonthActivity: false, standalone: false }), 'install');

eq('a browser visitor on a phone is asked to install', due({ standalone: false }), 'install');
eq('but never on desktop - the instructions do not exist there', due({ standalone: false, mobile: false }), null);
eq('and never once installed (customize takes over)', due({}), 'customize');
eq('an install dismissal is forever', due({ standalone: false, prefs: { installDismissed: true } }), null);

eq('two days in with factory settings: the customize tip', due({}), 'customize');
eq('one day in: not yet',
  due({ prefs: { onboardedAt: new Date(NOW.getTime() - 1 * 864e5).toISOString() } }), null);
eq('touched categories: they found the screen', due({ catsUntouched: false }), null);
eq('touched sources alone also counts', due({ sourcesUntouched: false }), null);
eq('customize dismissed: never again', due({ prefs: { customizeDismissed: true } }), null);
eq('no onboarding stamp yet: wait for it', due({ prefs: { onboardedAt: undefined } }), null);

// ── the toggles rule them all ──────────────────────────────────────────────
eq('tips off silences install', due({ standalone: false, prefs: { tips: false } }), null);
eq('tips off silences customize', due({ prefs: { tips: false } }), null);
eq('recap off silences the recap but not the tips',
  due({ hasPrevMonthActivity: true, standalone: false, prefs: { recap: false } }), 'install');

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
