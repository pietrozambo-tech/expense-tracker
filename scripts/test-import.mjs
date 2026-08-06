// Runs the recurrence scenarios in scripts/import-test/scenarios.ts against
// the real src/app/lib/importData.ts.
//
//   pnpm test:recurrence            what the app does today (should pass)
//   pnpm test:recurrence --before   the pre-fix behaviour  (should fail)
//
// The --before run is what stops these scenarios quietly becoming a test that
// passes no matter what the recurrence layer does.
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
  console.error('import-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'import-test-'));
try {
  mkdirSync(join(tmp, 'lib'));
  mkdirSync(join(tmp, 'utils'));
  copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'types.ts'));
  for (const f of ['importData.ts', 'dates.ts', 'fx.ts', 'currencyData.ts']) {
    copyFileSync(join(root, 'src/app/lib', f), join(tmp, 'lib', f));
  }
  copyFileSync(join(root, 'src/app/utils/currency.ts'), join(tmp, 'utils/currency.ts'));
  // currency.ts reads the app language for locale-aware formatting.
  mkdirSync(join(tmp, 'i18n'));
  copyFileSync(join(root, 'src/app/i18n/store.ts'), join(tmp, 'i18n/store.ts'));
  copyFileSync(join(root, 'scripts/import-test/scenarios.ts'), join(tmp, 'scenarios.ts'));

  const bundle = join(tmp, 'scenarios.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scenarios.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });

  execFileSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: 'inherit' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
