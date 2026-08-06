// Checks that every description and subcategory in the sample dataset has an
// Italian translation, and that every demo category id resolves in the Italian
// catalogue. Runs against the real source files, so adding a sample row
// without extending demoItalian.ts fails here instead of shipping a
// half-English Italian demo.
//
// Same assembly trick as test-sync.mjs: esbuild is only resolvable as a binary
// under .pnpm, not as an import from here.

import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('demo-i18n-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'demo-i18n-test-'));
try {
  const entry = join(tmp, 'check.ts');
  writeFileSync(
    entry,
    `
import { mockExpenses } from '${join(root, 'src/app/components/mockExpenses.ts').replace(/\\/g, '/')}';
import { demoTranslationGaps, localiseDemoRow } from '${join(root, 'src/app/lib/demoItalian.ts').replace(/\\/g, '/')}';
import { setLanguage } from '${join(root, 'src/app/i18n/store.ts').replace(/\\/g, '/')}';
import { defaultCategoriesFor, defaultIncomeCategoriesFor } from '${join(root, 'src/app/components/categories.ts').replace(/\\/g, '/')}';

const gaps = demoTranslationGaps(mockExpenses);
let failed = false;
if (gaps.descriptions.length) {
  failed = true;
  console.error('Untranslated demo descriptions:');
  for (const d of gaps.descriptions) console.error('  - ' + d);
}
if (gaps.subcategories.length) {
  failed = true;
  console.error('Untranslated demo subcategories:');
  for (const s of gaps.subcategories) console.error('  - ' + s);
}

// Every demo category id must exist in the Italian catalogue, or the row
// keeps its English category object after localisation.
const itIds = new Set([...defaultCategoriesFor('it'), ...defaultIncomeCategoriesFor('it')].map((c) => c.id));
const missing = [...new Set(mockExpenses.map((t) => t.category?.id).filter((id) => id && !itIds.has(id)))];
if (missing.length) {
  failed = true;
  console.error('Demo category ids missing from the Italian catalogue: ' + missing.join(', '));
}

// And the localised rows must actually come out Italian-named when the user's
// catalogue is the Italian-seeded one.
setLanguage('it');
const itCatalogue = [...defaultCategoriesFor('it'), ...defaultIncomeCategoriesFor('it')];
const sample = localiseDemoRow(mockExpenses.find((t) => t.description === 'Monthly rent'), itCatalogue);
if (sample.description !== 'Affitto mensile' || sample.category.name !== 'Casa' || sample.subcategory !== 'Affitto') {
  failed = true;
  console.error('localiseDemoRow spot check failed: ' + JSON.stringify({ d: sample.description, c: sample.category.name, s: sample.subcategory }));
}

console.log(failed ? 'FAILED' : 'All demo strings covered: ' + mockExpenses.length + ' rows, gaps: none.');
process.exit(failed ? 1 : 0);
`,
  );
  const out = join(tmp, 'check.mjs');
  // .ts before .tsx: components/ holds both categories.ts (data) and
  // Categories.tsx (screen), and the default order resolves the wrong one.
  execFileSync(esbuild, [entry, '--bundle', '--format=esm', '--platform=node', '--resolve-extensions=.ts,.tsx,.js', `--outfile=${out}`, '--log-level=error']);
  const { status } = await import('node:child_process').then(({ spawnSync }) =>
    spawnSync(process.execPath, [out], { stdio: 'inherit' }),
  );
  process.exit(status ?? 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
