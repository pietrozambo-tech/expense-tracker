// Regenerates site/privacy.html and site/terms.html from the same module the
// app renders (src/app/lib/legalContent.ts), so the copies deployed to
// tracklylab.com cannot drift from the ones inside the app.
//
// site/index.html (the landing page) is handwritten and left alone.
//
// Run with:  pnpm site
//
// esbuild is invoked through its binary rather than its JS API - the package
// is a transitive dependency under .pnpm and not resolvable by import from
// here, but its bin script runs fine.

import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const esbuildBin = globSync(
  join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'),
)[0];
if (!esbuildBin) {
  console.error('site: esbuild binary not found under node_modules/.pnpm');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'site-'));
try {
  const entry = join(tmp, 'entry.ts');
  writeFileSync(
    entry,
    `export { LEGAL_DOCS } from '${join(root, 'src/app/lib/legalContent.ts')}';\n` +
      `export { renderLegalHtml } from '${join(root, 'src/app/lib/legalHtml.ts')}';\n`,
  );
  const bundled = join(tmp, 'legal.mjs');
  execFileSync(process.execPath, [
    esbuildBin, entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${bundled}`, '--log-level=silent',
  ]);

  const { LEGAL_DOCS, renderLegalHtml } = await import(pathToFileURL(bundled).href);
  mkdirSync(join(root, 'site'), { recursive: true });
  for (const doc of LEGAL_DOCS) {
    writeFileSync(join(root, 'site', `${doc.slug}.html`), renderLegalHtml(doc));
    console.log(`site: wrote site/${doc.slug}.html`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
