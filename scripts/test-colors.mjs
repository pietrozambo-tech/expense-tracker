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

// --- 2. nobody builds a Tailwind class name at runtime ------------------
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
});
// Comments stripped first: these checks look for code that RUNS. A comment
// naming the mistake - which the fixes here deliberately do, so the next reader
// knows why the code looks the way it does - is not the mistake.
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const files = walk('src').map((p) => [p, decomment(read(p))]);

// Any string surgery that ends up in a class list. Tailwind only emits classes
// it can see written out, so one assembled at runtime is a coin flip.
const derived = files.filter(([, s]) =>
  /className=\{`[^`]*\$\{[^}]*\.replace\(/.test(s) || /replace\(\s*['"](?:text|bg|border)-['"]/.test(s));
if (derived.length) {
  fail(`builds a class name at runtime (use categoryHex/categoryTint instead): ${derived.map(([p]) => p).join(', ')}`);
} else {
  pass('no file assembles a Tailwind class from a stored value');
}

// --- 3. no utilities Tailwind v4 removed --------------------------------
// bg-opacity-50 and friends were dropped in v4 in favour of the bg-white/50
// slash syntax. They do not error - they emit nothing - so a fill written that
// way keeps its base colour and silently ignores the opacity.
const GONE = /\b(?:bg|text|border|divide|ring|placeholder)-opacity-\d+\b/;
const stale = files.filter(([, s]) => GONE.test(s));
if (stale.length) {
  fail(`uses a v3 opacity utility that v4 removed: ${stale.map(([p]) => p).join(', ')}`);
} else {
  pass('no removed-in-v4 opacity utilities');
}

// --- 4. the shades actually differ, so a wrong table entry shows up -----
// Guards against someone "fixing" a missing hue by copying its neighbour.
const hexes = [...colorsSrc.matchAll(/'text-[a-z]+-\d+':\s*'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1].toUpperCase());
const dupes = hexes.filter((h, i) => hexes.indexOf(h) !== i);
if (dupes.length) fail(`two colours share a hex: ${[...new Set(dupes)].join(', ')}`);
else pass(`all ${hexes.length} hexes are distinct`);

// --- 5. the series palette still passes the checks it was chosen by -----
//
// --series-1..5 paint the parts of a trip's breakdown, and their whole job is
// to be told apart at 8px. They were picked by running the six checks - not by
// eye - so a hand edit that "just darkens one" has to face the same checks or
// the bar quietly goes back to being a gradient.
//
// Both themes, each against the card its mode actually paints on.
{
  const { validate } = await import('./palette/validate.mjs');
  const css = read('src/styles/index.css');
  const seriesIn = (block) =>
    [1, 2, 3, 4, 5].map((i) => {
      const m = new RegExp(`--series-${i}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
      return m?.[1];
    });

  // The dark block redefines them; everything before it is the light set.
  const darkAt = css.indexOf('html[data-theme="dark"]');
  const modes = [
    { mode: 'light', surface: '#FFFFFF', hexes: seriesIn(css.slice(0, darkAt)) },
    { mode: 'dark', surface: '#232329', hexes: seriesIn(css.slice(darkAt)) },
  ];

  for (const { mode, surface, hexes } of modes) {
    if (hexes.some((h) => !h)) {
      fail(`${mode}: --series-1..5 are not all defined in index.css`);
      continue;
    }
    const { report, ok } = validate(hexes, { mode, surface });
    if (ok) pass(`series palette passes all checks on the ${mode} card`);
    else {
      for (const [name, status, detail] of report) {
        if (status === 'fail') fail(`${mode} series palette - ${name}: ${detail}`);
      }
    }
  }
}

console.log(failures === 0 ? '\nEvery category colour resolves to paint that exists.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
