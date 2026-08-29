// The app's import instructions, copied into the Edge Function.
//
//   pnpm build:edge-prompt          rewrite the region
//   pnpm build:edge-prompt --check  fail if it is stale (what CI runs)
//
// WHY A COPY AT ALL
//
// The Supabase dashboard editor deploys exactly one file, and the project is
// deployed by paste from a phone as often as by CLI. An import of
// ../../src/app/lib/importPrompt.ts would be a second file at best and a
// broken deploy at worst.
//
// WHY A GENERATED COPY
//
// Because the alternative has already happened here. The English and Italian
// prompt bodies were maintained by hand as twins, and one of them kept a wrong
// rule for months with nothing to notice. A copy is fine; a copy nothing
// checks is how that starts. So: this writes it, scripts/test-edge.mjs proves
// the written copy still renders what the app renders, and neither is optional.
//
// The bundle is tree-shaken from scripts/edge-prompt/entry.ts, which names the
// five things the function is allowed to use.
import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(root, 'supabase/functions/convert-import/index.ts');
const OPEN = '// #region prompt';
const CLOSE = '// #endregion prompt';
const HEADER = [
  `${OPEN} ---------------------------------------------------------`,
  '// GENERATED - do not edit. Run `pnpm build:edge-prompt` after changing',
  '// src/app/lib/importPrompt.ts; `pnpm test:edge` fails if this is stale.',
];
const FOOTER = `${CLOSE} ------------------------------------------------------`;

/** The bundle, as it should appear inside the function today. */
export function renderRegion() {
  const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
  if (!esbuild) throw new Error('esbuild binary not found under node_modules/.pnpm');

  const tmp = mkdtempSync(join(tmpdir(), 'edge-prompt-'));
  try {
    const out = join(tmp, 'prompt.mjs');
    execFileSync(process.execPath, [
      esbuild, join(root, 'scripts/edge-prompt/entry.ts'),
      '--bundle', '--format=esm',
      // Neutral, not node: this runs in Deno, and a bundle that quietly
      // reaches for a node built-in would only say so on deploy.
      '--platform=neutral', '--target=es2022',
      `--outfile=${out}`, '--log-level=warning',
    ], { stdio: 'inherit' });

    let code = readFileSync(out, 'utf8');
    // esbuild closes an ESM bundle with its export list. Inside a region in
    // the middle of another module those names are already in scope, and the
    // statement would re-export them out of the function. Asserted rather
    // than assumed: if esbuild ever emits a different shape, this stops
    // instead of silently shipping a bundle with no entry point.
    const tail = /\nexport\s*\{[^}]*\};?\s*$/;
    if (!tail.test(code)) throw new Error('the bundle did not end with an export list - check the esbuild output');
    code = code.replace(tail, '\n');
    for (const name of ['buildImportPrompt', 'TRIP_SEP', 'isTripName', 'tripBodyOf', 'travelCategoryOf']) {
      if (!code.includes(name)) throw new Error(`${name} is missing from the bundle - entry.ts and the function disagree`);
    }
    return `${HEADER.join('\n')}\n${code.trim()}\n${FOOTER}\n`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Where a fence sits, insisting there is exactly one of it.
 *
 * Anchored to the start of a line, and counted. The function's own header
 * comment lists the region names, so a substring search can match prose: the
 * failure that invites is splicing 700 lines of instructions into the middle
 * of a comment, which nothing downstream would report as anything but a
 * syntax error a long way from its cause.
 */
function fenceAt(text, marker) {
  const re = new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gm');
  const hits = [...text.matchAll(re)];
  if (hits.length !== 1) {
    throw new Error(`expected exactly one "${marker}" line in the function, found ${hits.length}`);
  }
  return hits[0].index;
}

/** The function file with the region replaced. */
export function renderFile() {
  const current = readFileSync(TARGET, 'utf8');
  const start = fenceAt(current, OPEN);
  const end = fenceAt(current, CLOSE);
  if (end < start) throw new Error('the "#region prompt" fence closes before it opens');
  const endOfLine = current.indexOf('\n', end);
  const after = endOfLine === -1 ? '' : current.slice(endOfLine + 1);
  return `${current.slice(0, start)}${renderRegion()}${after}`;
}

export const targetPath = TARGET;

// Only when run directly - test-edge.mjs imports the two renderers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const wanted = renderFile();
  const current = readFileSync(TARGET, 'utf8');
  if (process.argv.includes('--check')) {
    if (wanted !== current) {
      console.error('build-edge-prompt: the function\'s copy of the instructions is stale - run `pnpm build:edge-prompt`');
      process.exit(1);
    }
    console.log('build-edge-prompt: the function is carrying the current instructions');
  } else if (wanted === current) {
    console.log('build-edge-prompt: already current');
  } else {
    writeFileSync(TARGET, wanted);
    console.log(`build-edge-prompt: rewrote the #region prompt in ${TARGET.slice(root.length + 1)}`);
  }
}
