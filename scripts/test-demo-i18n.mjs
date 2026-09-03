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
import { categories, incomeCategories, defaultCategoriesFor, defaultIncomeCategoriesFor, droppedCategoryIdsFor } from '${join(root, 'src/app/components/categories.ts').replace(/\\/g, '/')}';
import { getDemoTransactions } from '${join(root, 'src/app/lib/demoData.ts').replace(/\\/g, '/')}';

// Loanwords and proper nouns: identical in both languages on purpose, so an
// equality check must not read them as untranslated.
const SHARED_WORDS = new Set(['Shopping', 'Sport', 'Tennis', 'Hotel', 'Streaming', 'Cloud', 'Uber/Taxi', 'Cinema', 'Bar']);

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

// No category may reach the Italian app still wearing English.
//
// localise() keeps the English name for any id the table does not mention, and
// keeps the English SUBCATEGORIES for any entry that gives a name without
// them. Both are silent: the category renders, it is simply in the wrong
// language, which is how a catalogue ends up half Italian and half English.
// Adding an English category without its Italian entry now fails here instead.
const enCats = [...defaultCategoriesFor('en'), ...defaultIncomeCategoriesFor('en')];
const itCats = new Map([...defaultCategoriesFor('it'), ...defaultIncomeCategoriesFor('it')].map((c) => [c.id, c]));
for (const en of enCats) {
  const it = itCats.get(en.id);
  if (!it) {
    // Absent is only legal when the language drops it on purpose.
    if (!itDropped.has(en.id)) {
      failed = true;
      console.error('Category ' + en.id + ' has no Italian entry and is not marked dropped');
    }
    continue;
  }
  if (it.name === en.name && !SHARED_WORDS.has(en.name)) {
    failed = true;
    console.error('Category ' + en.id + ' is still English in Italian: "' + en.name + '"');
  }
  const enSubs = en.subcategories ?? [];
  const itSubs = it.subcategories ?? [];
  // Identical lists are only suspicious when they are not ALL loanwords -
  // Abbonamenti really is Streaming and Cloud in both languages.
  if (enSubs.length && enSubs.join('|') === itSubs.join('|') && !enSubs.every((x) => SHARED_WORDS.has(x))) {
    failed = true;
    console.error('Category ' + en.id + ' kept its English subcategories: ' + enSubs.join(', '));
  }
  for (const sub of itSubs) {
    if (enSubs.includes(sub) && !SHARED_WORDS.has(sub)) {
      failed = true;
      console.error('Subcategory "' + sub + '" (' + en.id + ') is the English word in the Italian list');
    }
  }
}

// A subcategory name may only appear under ONE category: the filters match on
// the name alone, so a name used twice pulls rows from both at once.
for (const [lang, list] of [['en', defaultCategoriesFor('en')], ['it', defaultCategoriesFor('it')]]) {
  const seen = new Map();
  for (const c of list) {
    for (const sub of c.subcategories ?? []) {
      if (seen.has(sub)) {
        failed = true;
        console.error(lang + ': subcategory "' + sub + '" is under both ' + seen.get(sub) + ' and ' + c.id);
      } else seen.set(sub, c.id);
    }
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

// Either language may leave a starter category out (English has no Buoni
// Pasto). The drop is per language, not a deletion from the dataset: the
// generated demo in THAT language must carry no row from it, every row it does
// carry must be bound to a category the catalogue has, and the base list must
// account for every id - present in the language, or dropped by it on purpose.
//
// And the subcategories the demo files rows under must be the catalogue's own
// chips, in the language's own spelling: a demo "Supermercato" next to a chip
// "Esselunga" is exactly the near-duplicate the drilldowns must never show. The
// few the demo invents on top of the defaults are listed, so a new one is a
// decision rather than an accident.
const INVENTED_SUBS = { en: new Set(['Christmas']), it: new Set(['Natale']) };
const counts = {};
for (const lang of ['it', 'en']) {
  setLanguage(lang);
  const catalogue = [...defaultCategoriesFor(lang), ...defaultIncomeCategoriesFor(lang)];
  const ids = new Set(catalogue.map((c) => c.id));
  const dropped = droppedCategoryIdsFor(lang);
  for (const base of [...categories, ...incomeCategories]) {
    if (!ids.has(base.id) && !dropped.has(base.id)) {
      failed = true;
      console.error(lang + ': category ' + base.id + ' is neither in the catalogue nor marked dropped');
    }
  }
  for (const id of dropped) {
    if (ids.has(id)) {
      failed = true;
      console.error(lang + ': category ' + id + ' is marked dropped but still in the catalogue');
    }
  }
  const demo = getDemoTransactions('EUR', catalogue);
  counts[lang] = demo.length;
  const leaked = demo.filter((t) => dropped.has(t.category?.id));
  if (leaked.length) {
    failed = true;
    console.error(lang + ': demo still contains ' + leaked.length + ' row(s) from dropped categories');
  }
  const orphans = demo.filter((t) => !t.category || !ids.has(t.category.id));
  if (orphans.length) {
    failed = true;
    console.error(lang + ': ' + orphans.length + ' demo row(s) are not bound to a catalogue category, e.g. "' + orphans[0]?.description + '"');
  }
  if (demo.length === 0) {
    failed = true;
    console.error(lang + ': demo came out empty');
  }
  const chips = new Map(catalogue.map((c) => [c.id, new Set(c.subcategories ?? [])]));
  const stray = new Set();
  for (const t of demo) {
    if (!t.subcategory || !t.category) continue;
    if (!chips.get(t.category.id)?.has(t.subcategory) && !INVENTED_SUBS[lang].has(t.subcategory)) {
      stray.add(t.category.name + ' / ' + t.subcategory);
    }
  }
  if (stray.size) {
    failed = true;
    console.error(lang + ': demo subcategories that are not chips of their category: ' + [...stray].sort().join(', '));
  }
}
setLanguage('en');

// An account seeded before today's starter list existed has no Company Welfare
// and no Buoni Pasto, and may still carry categories the list has since lost.
// Loading the demo there must not orphan a single row: whatever the catalogue
// on the device is, it is the only list a demo row may point at.
{
  const legacy = [
    ...defaultCategoriesFor('en'),
    ...defaultIncomeCategoriesFor('en').filter((c) => c.id !== 'company-welfare'),
    { id: 'royalties', name: 'Royalties', icon: 'Sparkles', color: 'text-purple-600', bgColor: 'bg-purple-50', selectedBg: 'bg-purple-100', type: 'income' },
  ];
  const legacyIds = new Set(legacy.map((c) => c.id));
  const demo = getDemoTransactions('EUR', legacy);
  const orphans = demo.filter((t) => !t.category || !legacyIds.has(t.category.id));
  if (orphans.length) {
    failed = true;
    console.error('legacy catalogue: ' + orphans.length + ' demo row(s) point at a category the account does not have, e.g. "' + orphans[0]?.description + '"');
  }
  if (demo.length === 0 || demo.length >= counts.en) {
    failed = true;
    console.error('legacy catalogue: expected a smaller, non-empty demo, got ' + demo.length + ' rows against ' + counts.en);
  }
  console.log('demo rows: en=' + counts.en + ' it=' + counts.it + ' legacy=' + demo.length);
}

// A category the user made by hand carries its own id. When it has the same
// name and type as the starter category a demo row was written for - in either
// language - the row is theirs and lands on it, instead of being thrown away
// for a mismatched id.
{
  const mine = [
    { id: 'cat-1', name: 'Food & Drinks', type: 'expense', icon: 'Utensils', color: 'text-orange-500', bgColor: 'bg-orange-50', selectedBg: 'bg-orange-100', subcategories: [] },
    { id: 'cat-2', name: 'casa', type: 'expense', icon: 'Home', color: 'text-blue-600', bgColor: 'bg-blue-50', selectedBg: 'bg-blue-100', subcategories: [] },
    { id: 'cat-3', name: 'Salary', type: 'income', icon: 'Briefcase', color: 'text-emerald-600', bgColor: 'bg-emerald-50', selectedBg: 'bg-emerald-100' },
  ];
  const demo = getDemoTransactions('EUR', mine);
  const ids = new Set(demo.map((t) => t.category?.id));
  const stray = demo.filter((t) => !t.category || !['cat-1', 'cat-2', 'cat-3'].includes(t.category.id));
  if (stray.length || !ids.has('cat-1') || !ids.has('cat-2') || !ids.has('cat-3')) {
    failed = true;
    console.error('hand-made catalogue: demo rows should land on cat-1/cat-2/cat-3 by name, got ids ' + [...ids].join(',') + ' with ' + stray.length + ' stray');
  }
  const rent = demo.find((t) => t.description === 'Monthly rent');
  if (!rent || rent.category.id !== 'cat-2') {
    failed = true;
    console.error('hand-made catalogue: "Monthly rent" should land on the Italian-named "casa", got ' + (rent?.category?.id ?? 'nothing'));
  }
  if (demo.length < 100) {
    failed = true;
    console.error('hand-made catalogue: expected a year of food, housing and salary, got ' + demo.length + ' rows');
  }
  console.log('demo rows on a hand-made three-category catalogue: ' + demo.length);
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
