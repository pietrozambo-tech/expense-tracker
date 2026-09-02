// Runs scripts/insight-test/check.ts against the real src/app/lib/saveInsight.ts.
// Same assembly as test-usual.mjs: esbuild is only resolvable as a binary.
import { execFileSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) {
  console.error('insight-test: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'insight-test-'));
try {
  mkdirSync(join(tmp, 'src/app/lib'), { recursive: true });
  mkdirSync(join(tmp, 'scripts/insight-test'), { recursive: true });
  copyFileSync(join(root, 'src/app/lib/saveInsight.ts'), join(tmp, 'src/app/lib/saveInsight.ts'));
  copyFileSync(join(root, 'scripts/insight-test/check.ts'), join(tmp, 'scripts/insight-test/check.ts'));

  const bundle = join(tmp, 'check.mjs');
  execFileSync(process.execPath, [
    esbuild, join(tmp, 'scripts/insight-test/check.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [bundle], { stdio: 'inherit' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
