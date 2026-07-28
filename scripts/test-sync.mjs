// Runs the cloud-sync scenarios in scripts/sync-test/scenarios.ts against the
// real src/app/lib/cloud.ts, with an in-memory stand-in for Supabase.
//
//   pnpm test:sync            what the app does today (should pass)
//   pnpm test:sync --before   the pre-fix behaviour  (should fail)
//
// The --before run matters: it is what stops these scenarios quietly becoming
// a test that passes no matter what the sync layer does.
//
// cloud.ts imports './supabase', which reaches for real credentials, so the
// module tree is assembled in a temp directory with the fake dropped in its
// place. Same trick, and the same reason, as scripts/build-site.mjs: esbuild
// is only resolvable as a binary under .pnpm, not as an import from here.

import { execFileSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('sync-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'sync-test-'));
try {
  mkdirSync(join(tmp, 'lib'));
  copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'types.ts'));
  copyFileSync(join(root, 'src/app/lib/cloud.ts'), join(tmp, 'lib/cloud.ts'));
  copyFileSync(join(root, 'scripts/sync-test/fake-supabase.ts'), join(tmp, 'lib/supabase.ts'));
  copyFileSync(join(root, 'scripts/sync-test/scenarios.ts'), join(tmp, 'scenarios.ts'));

  const bundle = join(tmp, 'scenarios.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scenarios.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ]);

  execFileSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: 'inherit' });
} catch (err) {
  // A failing scenario exits non-zero; that is a result, not a crash.
  process.exit(typeof err.status === 'number' ? err.status : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
