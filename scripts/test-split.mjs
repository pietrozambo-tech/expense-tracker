// The split-file share reader (src/app/lib/splitFile.ts), against files from
// three different tools plus the shapes it must refuse.
//
//   pnpm test:split

import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('split-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'split-test-'));
let failed = 0;
try {
  const bundle = join(tmp, 'check.mjs');
  execFileSync(process.execPath, [
    esbuild, join(root, 'scripts/split-test/check.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [bundle], { stdio: 'inherit' });
} catch {
  failed = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

process.exit(failed);
