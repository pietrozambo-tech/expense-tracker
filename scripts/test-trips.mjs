// Runs scripts/trips-test/check.ts against the real lib/trips.ts and the
// real recurrence engine.
//
// Same assembly trick as the other TS-backed suites: esbuild is only
// resolvable as a binary under .pnpm, not as an import from here. Bundled
// straight out of the repo rather than a copied tree, so the imports resolve
// to the files that actually ship.
//
//   pnpm test:trips

import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('trips-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'trips-test-'));
let failed = 0;
try {
  const bundle = join(tmp, 'check.mjs');
  execFileSync(process.execPath, [
    esbuild, join(root, 'scripts/trips-test/check.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [bundle], { stdio: 'inherit' });
} catch {
  failed = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

process.exit(failed);
