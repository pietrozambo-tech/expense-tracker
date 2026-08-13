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
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
