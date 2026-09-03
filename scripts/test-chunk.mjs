// Runs scripts/chunk-test/check.ts against the real split helpers in
// src/app/lib/aiImport.ts. Bundled straight from the tree - the helpers are
// pure, so nothing here needs a network, a browser or a Supabase client.
import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
if (!esbuild) { console.error('chunk-test: esbuild binary not found under node_modules/.pnpm'); process.exit(1); }

const tmp = mkdtempSync(join(tmpdir(), 'chunk-test-'));
try {
  const bundle = join(tmp, 'check.mjs');
  execFileSync(process.execPath, [
    esbuild, join(root, 'scripts/chunk-test/check.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
    // aiImport pulls in the Supabase client, which reads Vite's import.meta.env
    // at module load. Nothing here calls it - the split helpers are pure - but
    // the reference has to resolve for the bundle to import at all.
    '--define:import.meta.env={}',
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [bundle], { stdio: 'inherit' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
