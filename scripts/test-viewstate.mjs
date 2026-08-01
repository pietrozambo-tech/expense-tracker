// Every choice a user makes on the Dashboard or in Activity must survive a
// remount, because App re-keys those tabs whenever refreshKey moves - a
// background sync pull, a recurring occurrence materialising. Four separate
// bugs were shipped this way (Activity's filters, Activity's scroll, Trend's
// direction toggle, the category sort), each found by a person noticing their
// screen had quietly reset.
//
// This makes that omission impossible to commit rather than merely unlikely.
// Every useState in those two components must be either:
//   - a field of the component's view-state interface, seeded from the restored
//     snapshot AND written back into it, or
//   - listed in scripts/viewstate-test/transient.json with a reason.
// A new useState in neither list fails the build.
//
//   pnpm test:viewstate

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const transient = JSON.parse(readFileSync(join(root, 'scripts/viewstate-test/transient.json'), 'utf8'));

/** Field names declared in `export interface <name> { ... }`. */
const interfaceFields = (src, name) => {
  const m = new RegExp(`export interface ${name}\\s*{([\\s\\S]*?)\\n}`).exec(src);
  if (!m) return null;
  return m[1]
    .split('\n')
    .map((l) => /^\s*([a-zA-Z][a-zA-Z0-9]*)\s*[?:]/.exec(l.replace(/\/\/.*/, '')))
    .filter(Boolean)
    .map((x) => x[1]);
};

/** The object literal assigned to `<ref>.current = { ... }`. */
const snapshotBody = (src, ref) => {
  const i = src.indexOf(`${ref}.current = {`);
  if (i === -1) return '';
  return src.slice(i, src.indexOf('};', i));
};

const files = [
  {
    file: 'src/app/components/Dashboard.tsx',
    // Which interface owns a field, and how its restored snapshot is named.
    homes: [
      { iface: 'DashboardViewState', saved: 'savedView', ref: 'viewStateRef' },
      { iface: 'TrendViewState', saved: 'savedTrend', ref: 'trendStateRef' },
    ],
  },
  {
    file: 'src/app/components/Activity.tsx',
    homes: [{ iface: 'ActivityViewState', saved: 'saved', ref: 'viewStateRef' }],
  },
];

let failures = 0;
const fail = (msg) => { failures++; console.log(`   FAIL  ${msg}`); };

for (const { file, homes } of files) {
  const base = file.split('/').pop();
  const src = readFileSync(join(root, file), 'utf8');
  const allowed = transient[base] ?? {};

  const homeData = homes.map((h) => ({
    ...h,
    fields: interfaceFields(src, h.iface) ?? [],
    snapshot: snapshotBody(src, h.ref),
  }));
  for (const h of homeData) {
    if (h.fields.length === 0) fail(`${base}: interface ${h.iface} not found or empty`);
  }

  // Every `const [x, setX] = useState...` and the line it sits on.
  const states = [...src.matchAll(/const \[([a-zA-Z][a-zA-Z0-9]*), set[A-Za-z0-9]+\] = useState/g)].map((m) => {
    // The initialiser can span many lines (a generic with an inline type, a
    // comment inside it), so read to the start of the next declaration rather
    // than guessing a line count.
    const rest = src.slice(m.index);
    const next = rest.slice(1).search(/\n  const \[/);
    return { name: m[1], init: next === -1 ? rest.slice(0, 900) : rest.slice(0, next + 1) };
  });

  console.log(`\n${base} - ${states.length} useState declarations`);

  for (const { name, init } of states) {
    if (name in allowed) continue;
    const home = homeData.find((h) => h.fields.includes(name));
    if (!home) {
      fail(`${base}: "${name}" is in no view-state interface and not declared transient.\n` +
           `         Either add it to a view-state interface (so it survives a remount)\n` +
           `         or list it in scripts/viewstate-test/transient.json with a reason.`);
      continue;
    }
    // Declared persisted - now prove the wiring, because the interface alone
    // does nothing. Restoring it takes three separate edits and missing any
    // one of them leaves the field silently dead.
    if (!init.includes(`${home.saved}?.${name}`) && !init.includes(`${home.saved}.${name}`)) {
      fail(`${base}: "${name}" is a ${home.iface} field but its useState does not read ${home.saved}?.${name} - it will not come back after a remount`);
    }
    if (!new RegExp(`\\b${name}\\b`).test(home.snapshot)) {
      fail(`${base}: "${name}" is a ${home.iface} field but is never written into ${home.ref}.current - it will not be remembered`);
    }
  }

  const covered = states.filter((s) => !(s.name in allowed)).length;
  console.log(`   ${covered} must persist, ${states.length - covered} declared transient`);
}

console.log('\n================================================================');
console.log(failures === 0
  ? ' Every Dashboard/Activity useState is accounted for.'
  : ` ${failures} problem(s) found.`);
console.log('================================================================\n');
process.exit(failures === 0 ? 0 : 1);
