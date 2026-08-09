// No form control may declare a font size under 16px.
//
// Under 16px, iOS zooms the whole page in when the field takes focus - and
// never zooms back out, so the app is left sitting off-centre until the user
// pinches it back. It is invisible on every desktop browser, which is exactly
// why it needs a check rather than a code review: the person adding a 15px
// field will not see anything wrong.
//
// theme.css puts a 16px floor on input/select/textarea, but that floor lives on
// the element selector, so any utility class or inline style still beats it.
// This catches the ones that would.
//
// Run with:  pnpm test:inputs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TAILWIND = {
  'text-xs': 12, 'text-sm': 14, 'text-base': 16, 'text-lg': 18,
  'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30, 'text-4xl': 36, 'text-5xl': 48,
};
const MIN = 16;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** The size a chunk of className/style text declares, or null for none. */
function declaredSize(text) {
  let px = null;
  for (const m of text.matchAll(/text-\[([0-9.]+)px\]/g)) px = parseFloat(m[1]);
  if (px === null) {
    for (const [cls, size] of Object.entries(TAILWIND)) {
      if (new RegExp(`(?<![\\w-])${cls}(?![\\w-])`).test(text)) px = size;
    }
  }
  const inline = /fontSize:\s*'?([0-9.]+)/.exec(text);
  if (inline) px = parseFloat(inline[1]);
  return px;
}

const offenders = [];
let checked = 0;

for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  // className / style constants declared in the same file, so a field written
  // as className={FIELD} is still measured rather than skipped.
  const consts = new Map();
  for (const m of src.matchAll(/const\s+(\w+)(?::\s*[^=]+?)?\s*=\s*'([^']*)'/g)) consts.set(m[1], m[2]);
  for (const m of src.matchAll(/const\s+(\w+)\s*:\s*React\.CSSProperties\s*=\s*(\{[^}]*\})/g)) consts.set(m[1], m[2]);

  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    const tag = m[1];
    const from = m.index + m[0].length;
    // Inputs are self-closing; select/textarea end at the first '>'.
    let end = src.indexOf('/>', from);
    if (tag !== 'input') {
      const gt = src.indexOf('>', from);
      if (end === -1 || (gt !== -1 && gt < end)) end = gt;
    }
    const attrs = src.slice(from, end === -1 ? from + 600 : end);
    checked++;

    let px = declaredSize(attrs);
    let via = '';
    if (px === null) {
      for (const ref of attrs.matchAll(/(?:className|style)=\{([A-Za-z_]\w*)\}/g)) {
        const target = consts.get(ref[1]);
        if (target === undefined) continue;
        const q = declaredSize(target);
        if (q !== null) { px = q; via = ` (via ${ref[1]})`; }
      }
    }
    if (px !== null && px < MIN) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${file}:${line}  <${tag}> declares ${px}px${via}`);
    }
  }
}

console.log(`Checked ${checked} form controls across src/.`);
if (offenders.length === 0) {
  console.log(`None declares a font size under ${MIN}px - iOS will not zoom on focus.`);
  process.exit(0);
}
console.log(`\n${offenders.length} control(s) under ${MIN}px - iOS zooms the page in when these take focus:\n`);
for (const o of offenders) console.log('  ' + o);
console.log(`\nRaise them to ${MIN}px, or drop the size and let the floor in theme.css apply.`);
process.exit(1);
