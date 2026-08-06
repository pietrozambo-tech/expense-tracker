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
import { defaultCategoriesFor, defaultIncomeCategoriesFor, droppedCategoryIdsFor } from '${join(root, 'src/app/components/categories.ts').replace(/\\/g, '/')}';
import { getDemoTransactions } from '${join(root, 'src/app/lib/demoData.ts').replace(/\\/g, '/')}';

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

// Every demo category id must either exist in the Italian catalogue or be one
// the language drops on purpose - anything else keeps its English category
// object after localisation and orphans the row.
const itIds = new Set([...defaultCategoriesFor('it'), ...defaultIncomeCategoriesFor('it')].map((c) => c.id));
const itDropped = droppedCategoryIdsFor('it');
const missing = [
  ...new Set(mockExpenses.map((t) => t.category?.id).filter((id) => id && !itIds.has(id) && !itDropped.has(id))),
];
if (missing.length) {
  failed = true;
  console.error('Demo category ids missing from the Italian catalogue: ' + missing.join(', '));
}

// A dropped category must be dropped in both directions: gone from the
// catalogue AND gone from the sample rows, so the Italian demo never shows
// spending under a category the user cannot see.
for (const id of itDropped) {
  if (itIds.has(id)) {
    failed = true;
    console.error('Category ' + id + ' is marked dropped for Italian but still in the catalogue');
  }
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

// The generated Italian demo must carry no row from a dropped category, and
// must still carry those rows in English - the drop is per language, not a
// deletion from the dataset.
const itDemo = getDemoTransactions('EUR', itCatalogue);
const leaked = itDemo.filter((t) => itDropped.has(t.category?.id));
if (leaked.length) {
  failed = true;
  console.error('Italian demo still contains ' + leaked.length + ' row(s) from dropped categories');
}
if (itDemo.length === 0) {
  failed = true;
  console.error('Italian demo came out empty');
}
setLanguage('en');
const enCatalogue = [...defaultCategoriesFor('en'), ...defaultIncomeCategoriesFor('en')];
const enDemo = getDemoTransactions('EUR', enCatalogue);
const enOfficeFood = enDemo.filter((t) => t.category?.id === 'office-food').length;
if (enOfficeFood === 0) {
  failed = true;
  console.error('English demo lost its Office Food rows - the drop must be Italian-only');
}
if (enDemo.length <= itDemo.length) {
  failed = true;
  console.error('Expected the Italian demo to be smaller: en=' + enDemo.length + ' it=' + itDemo.length);
}
console.log('demo rows: en=' + enDemo.length + ' it=' + itDemo.length + ' (office-food in en: ' + enOfficeFood + ')');

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
