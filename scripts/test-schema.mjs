// Runs supabase/schema-shared.sql against a REAL Postgres and exercises the
// pairing flow as two different users, then as an outsider.
//
//   pnpm test:schema
//
// Why bother, when the SQL only ever runs on Supabase: RLS bugs are silent
// until someone hits them, and the first one here was invisible to review -
// `insert ... returning id` (how the client learns the household id) was
// rejected because the founder is not yet a member at that instant. A policy
// that reads correctly can still refuse the very first call.
//
// Supabase's auth schema is stubbed (scripts/schema-test/supabase-stub.sql):
// an auth.users table, an auth.uid() reading a session GUC, and the anon /
// authenticated roles. Everything else is the real file, unmodified.
//
// Skips cleanly (exit 0) where no Postgres is installed, so it never blocks a
// machine that just wants to build the app.

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, globSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/bin', '/usr/bin']
  .find((d) => existsSync(join(d, 'initdb')));

if (!PGBIN) {
  console.log('test:schema - no local Postgres (initdb not found), skipping');
  process.exit(0);
}

// The exact keys the client puts on the wire, produced by the real modules
// rather than transcribed by hand - a transcription would drift the moment
// somebody adds a column, which is the failure this whole check exists for.
// Same esbuild assembly as test-shared.mjs.
function clientRowShape() {
  const esbuild = globSync(join(root, 'node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild'))[0];
  if (!esbuild) throw new Error('esbuild binary not found under node_modules/.pnpm');
  const tmp = mkdtempSync(join(tmpdir(), 'wire-shape-'));
  try {
    mkdirSync(join(tmp, 'lib'));
    mkdirSync(join(tmp, 'utils'));
    mkdirSync(join(tmp, 'i18n'));
    copyFileSync(join(root, 'src/app/types.ts'), join(tmp, 'types.ts'));
    for (const f of ['shared.ts', 'sharedSync.ts', 'fx.ts', 'currencyData.ts']) {
      copyFileSync(join(root, 'src/app/lib', f), join(tmp, 'lib', f));
    }
    copyFileSync(join(root, 'src/app/utils/currency.ts'), join(tmp, 'utils/currency.ts'));
    copyFileSync(join(root, 'src/app/i18n/store.ts'), join(tmp, 'i18n/store.ts'));
    writeFileSync(join(tmp, 'shape.ts'), `
import { planSync } from './lib/sharedSync';
const txn = {
  id: 't1', description: 'Rent', amount: 900, currency: 'EUR', type: 'expense',
  date: '2026-08-01', split: { mine: 450 }, updatedAt: '2026-08-01T10:00:00.000Z',
  category: { id: 'housing', name: 'Housing', icon: 'Home' },
};
const plan = planSync([txn as any], [], 'me', 'h1', []);
// settlements are written straight from householdCloud.pushSettlement; its
// shape is small and stable, so it is stated here rather than executed.
console.log(JSON.stringify({
  shared_items: Object.keys(plan.push[0]),
  settlements: ['id', 'household_id', 'from_user', 'to_user', 'date', 'amount', 'updated_at'],
  households: ['created_by', 'default_split', 'track_balance', 'updated_at'],
  household_members: ['household_id', 'user_id', 'display_name', 'color'],
}));
`);
    const bundle = join(tmp, 'shape.mjs');
    execFileSync(process.execPath, [
      esbuild, join(tmp, 'shape.ts'),
      '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning',
    ]);
    return execFileSync(process.execPath, [bundle], { encoding: 'utf8' });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts, env: { ...process.env, PATH: `${PGBIN}:${process.env.PATH}` } });

// initdb refuses to run as root, so use an unprivileged account when we are.
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
let RUNAS = null;
if (asRoot) {
  if (run('id', ['-u', 'pgtest']).status !== 0) run('useradd', ['-m', 'pgtest']);
  RUNAS = 'pgtest';
}

const dir = mkdtempSync(join('/var/tmp', 'schema-test-'));
// A private port, so a stray server (or a parallel run) never collides.
const PORT = String(5500 + Math.floor(Math.random() * 400));
const data = join(dir, 'data');
const sock = dir;
const sh = (script) =>
  RUNAS
    ? run('su', [RUNAS, '-c', `PATH=${PGBIN}:$PATH ${script}`])
    : run('bash', ['-c', `PATH=${PGBIN}:$PATH ${script}`]);

let started = false;
try {
  if (RUNAS) run('chown', ['-R', RUNAS, dir]);
  const init = sh(`initdb -D ${data} -U postgres --auth=trust`);
  if (init.status !== 0) {
    console.log('test:schema - could not initdb, skipping\n' + (init.stderr || '').trim());
    process.exit(0);
  }
  const up = sh(`pg_ctl -D ${data} -l ${dir}/log -o "-p ${PORT} -k ${sock}" -w start`);
  if (up.status !== 0) {
    console.log('test:schema - could not start Postgres, skipping\n' + (up.stderr || '').trim());
    process.exit(0);
  }
  started = true;

  const psql = (args) =>
    execFileSync(join(PGBIN, 'psql'), ['-h', sock, '-p', PORT, '-U', 'postgres', '-q', ...args], {
      encoding: 'utf8',
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    });

  psql(['-v', 'ON_ERROR_STOP=1', '-f', join(root, 'scripts/schema-test/supabase-stub.sql')]);
  psql(['-v', 'ON_ERROR_STOP=1', '-f', join(root, 'supabase/schema-shared.sql')]);
  console.log('schema applies cleanly');

  // ── The wire guard ────────────────────────────────────────────────────────
  // Every column the client writes must exist in the table it writes to.
  //
  // This is the check that was missing when `updated_by` was added: the code
  // shipped, the deployed table did not have the column, and PostgREST
  // rejected every push. Nothing surfaced - the other phone simply never saw
  // an expense again. A mismatch is now a build failure, and the row shape is
  // taken from planSync itself rather than a list somebody has to remember to
  // update.
  const shape = JSON.parse(clientRowShape());
  const columnsOf = (table) =>
    psql(['-tA', '-c', `select column_name from information_schema.columns where table_schema='public' and table_name='${table}'`])
      .split('\n').map((s) => s.trim()).filter(Boolean);
  let wireFailed = 0;
  for (const [table, keys] of Object.entries(shape)) {
    const cols = new Set(columnsOf(table));
    const missing = keys.filter((k) => !cols.has(k));
    if (missing.length) {
      console.error(`  FAIL  ${table}: client writes column(s) the schema lacks - ${missing.join(', ')}`);
      wireFailed++;
    } else {
      console.log(`  PASS  ${table}: all ${keys.length} client columns exist`);
    }
  }
  if (wireFailed) {
    console.error('wire guard failed - supabase/schema-shared.sql is behind the client');
    process.exit(1);
  }

  const out = psql(['-f', join(root, 'scripts/schema-test/flow.sql')]);
  const lines = out.split('\n').map((l) => l.replace(/^NOTICE:\s*/, '').trim())
    .filter((l) => l.startsWith('PASS') || l.startsWith('FAIL'));
  lines.forEach((l) => console.log(' ', l));

  const failed = lines.filter((l) => l.startsWith('FAIL'));
  if (lines.length === 0) {
    console.error('test:schema - no checks ran');
    process.exit(1);
  }
  if (failed.length) {
    console.error(`${failed.length} schema check(s) failed`);
    process.exit(1);
  }
  console.log(`all ${lines.length} schema checks passed`);
} finally {
  if (started) sh(`pg_ctl -D ${data} -m immediate stop`);
  rmSync(dir, { recursive: true, force: true });
}
