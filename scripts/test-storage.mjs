// Runs the storage scenarios in scripts/storage-test/scenarios.ts against the
// real src/app/lib/kv.ts + storage.ts.
//
//   pnpm test:storage            what the app does today (should pass)
//   pnpm test:storage --before   the localStorage-only build (should fail)
//
// @capacitor/preferences is aliased to a controllable stub, which is what makes
// "iOS evicted the web view's storage" something we can actually simulate.
//
// Same assembly trick as test-sync.mjs: esbuild is only resolvable as a binary
// under .pnpm, not as an import from here.

import { execFileSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('storage-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'storage-test-'));
try {
  mkdirSync(join(tmp, 'lib'));
  mkdirSync(join(tmp, 'components'));
  copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'types.ts'));
  for (const f of ['storage.ts', 'kv.ts', 'platform.ts', 'nudges.ts']) {
    copyFileSync(join(root, 'src/app/lib', f), join(tmp, 'lib', f));
  }
  for (const f of ['categories.ts', 'sources.ts']) {
    copyFileSync(join(root, 'src/app/components', f), join(tmp, 'components', f));
  }
  copyFileSync(join(root, 'scripts/storage-test/scenarios.ts'), join(tmp, 'scenarios.ts'));
  copyFileSync(join(root, 'scripts/storage-test/prefs-stub.ts'), join(tmp, 'prefs-stub.ts'));

  const bundle = join(tmp, 'scenarios.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scenarios.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
    `--alias:@capacitor/preferences=${join(tmp, 'prefs-stub.ts')}`,
  ], { stdio: 'inherit' });

  execFileSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: 'inherit' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
