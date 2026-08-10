// Every category colour must resolve to real paint.
//
// Categories store their colour as an icon class ("text-emerald-600"). Code
// that needs the SOLID has two ways to get one, and only one of them is safe:
//
//   categoryHex(c.color)                  - a hex, from a table
//   c.color.replace('text-', 'bg-')       - a class name, invented at runtime
//
// The second compiles, typechecks, and renders nothing when Tailwind never
// generated that class. It shipped: the swatch list carries one solid shade
// per hue (emerald-500), four seeded categories are a shade darker
// (emerald-600), and so Salary - 95% of income - painted a blank segment and a
// blank dot on the Monthly Average by Category card. Nothing failed; the
// colour was just absent.
//
// So this checks the table is total, and that nobody derives a solid class
// from a text class again.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(p, 'utf8');
let failures = 0;
const fail = (msg) => { failures++; console.log(`   FAIL  ${msg}`); };
const pass = (msg) => console.log(`   PASS  ${msg}`);

const colorsSrc = read('src/app/components/categoryColors.ts');
const catsSrc = read('src/app/components/categories.ts');

// --- 1. categoryHex covers every colour a category can carry ------------
const hexKeys = new Set([...colorsSrc.matchAll(/'(text-[a-z]+-\d+)':\s*'#/g)].map((m) => m[1]));

const seeded = [...catsSrc.matchAll(/name: '([^']+)',\s*\n\s*icon: '[^']*',\s*\n\s*color: '(text-[a-z]+-\d+)'/g)]
  .map(([, name, color]) => ({ name, color }));
const palette = [...colorsSrc.matchAll(/\{ name: '[^']+', color: '(text-[a-z]+-\d+)'/g)].map((m) => m[1]);

console.log(`Checked ${seeded.length} seeded categories and ${palette.length} picker colours.`);

const uncovered = [
  ...seeded.filter((c) => !hexKeys.has(c.color)).map((c) => `${c.name} (${c.color})`),
  ...palette.filter((c) => !hexKeys.has(c)).map((c) => `picker ${c}`),
];
if (uncovered.length) fail(`categoryHex has no entry for: ${uncovered.join(', ')}`);
else pass('every seeded and pickable colour resolves to a hex');

// --- 2. nobody builds a Tailwind class out of a stored colour -----------
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
});

const derivers = walk('src').filter((p) => /replace\(\s*['"]text-['"]\s*,\s*['"]bg-['"]/.test(read(p)));
if (derivers.length) {
  fail(`derives a solid class from a text class (use categoryHex instead): ${derivers.join(', ')}`);
} else {
  pass('no file turns a text- class into a bg- class at runtime');
}

// --- 3. the shades actually differ, so a wrong table entry shows up -----
// Guards against someone "fixing" a missing hue by copying its neighbour.
const hexes = [...colorsSrc.matchAll(/'text-[a-z]+-\d+':\s*'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1].toUpperCase());
const dupes = hexes.filter((h, i) => hexes.indexOf(h) !== i);
if (dupes.length) fail(`two colours share a hex: ${[...new Set(dupes)].join(', ')}`);
else pass(`all ${hexes.length} hexes are distinct`);

console.log(failures === 0 ? '\nEvery category colour resolves to paint that exists.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
