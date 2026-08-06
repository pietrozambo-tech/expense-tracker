// Runs the day-of-week scenarios in scripts/dow-test/scenarios.ts against the
// real src/app/lib/dayOfWeek.ts.
//
//   pnpm test:dow            averages per occurrence (should pass)
//   pnpm test:dow --before   plain totals, the naive version (should fail)
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
  console.error('dow-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'dow-test-'));
try {
  mkdirSync(join(tmp, 'lib'));
  mkdirSync(join(tmp, 'utils'));
  copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'types.ts'));
  for (const f of ['dayOfWeek.ts', 'dates.ts', 'fx.ts', 'currencyData.ts']) {
    copyFileSync(join(root, 'src/app/lib', f), join(tmp, 'lib', f));
  }
  copyFileSync(join(root, 'src/app/utils/currency.ts'), join(tmp, 'utils/currency.ts'));
  // currency.ts reads the app language for locale-aware formatting.
  mkdirSync(join(tmp, 'i18n'));
  copyFileSync(join(root, 'src/app/i18n/store.ts'), join(tmp, 'i18n/store.ts'));
  copyFileSync(join(root, 'scripts/dow-test/scenarios.ts'), join(tmp, 'scenarios.ts'));

  const bundle = join(tmp, 'scenarios.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scenarios.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });

  execFileSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: 'inherit' });
} catch (err) {
  process.exit(typeof err.status === 'number' ? err.status : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
