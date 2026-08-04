// Stand-in for src/app/lib/supabase.ts: an in-memory table behaving like the
// real one for the calls cloud.ts makes - crucially, a conditional UPDATE
// matches zero rows when the filter does not match, which is what makes the
// version check work in Postgres.
//
// It also mimics what Postgres does to a timestamp on the way through, which
// this stand-in used to hide by storing the client's string verbatim: a
// timestamptz is a moment, not text, and PostgREST renders it back with a
// `+00:00` offset and no trailing zeros in the fraction. A device that wrote
// `...:00.120Z` reads back `...:00.12+00:00` - so any code comparing the two
// as strings concludes, wrongly, that someone else has written.
type Row = { user_id: string; data: unknown; updated_at: string };

export const db: { rows: Row[] } = { rows: [] };

/** How Postgres would hand back a timestamptz the client wrote as ISO/Z. */
function asTimestamptz(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const frac = String(d.getUTCMilliseconds()).padStart(3, '0').replace(/0+$/, '');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` +
    (frac ? `.${frac}` : '') +
    '+00:00'
  );
}

/** WHERE updated_at = '...' compares moments, not text, once the literal is
 *  cast to timestamptz - so a Z-suffixed stamp still matches its own row. */
function filterMatches(col: string, rowValue: unknown, want: string): boolean {
  if (col !== 'updated_at') return rowValue === want;
  const a = Date.parse(String(rowValue));
  const b = Date.parse(want);
  return Number.isNaN(a) || Number.isNaN(b) ? rowValue === want : a === b;
}

function builder() {
  let action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let pending: any = null;
  const filters: Record<string, string> = {};

  const api: any = {
    select() { if (action === 'select') action = 'select'; return api; },
    insert(row: Row) { action = 'insert'; pending = row; return api; },
    update(patch: any) { action = 'update'; pending = patch; return api; },
    delete() { action = 'delete'; return api; },
    eq(col: string, val: string) { filters[col] = val; return api; },
    maybeSingle() { return api; },
    then(resolve: (v: any) => void) {
      if (action === 'insert') {
        if (db.rows.some((r) => r.user_id === pending.user_id)) {
          return Promise.resolve(resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }));
        }
        db.rows.push({ ...pending, updated_at: asTimestamptz(pending.updated_at) });
        return Promise.resolve(resolve({ data: [pending], error: null }));
      }
      if (action === 'update') {
        // Every eq() must match, exactly as the WHERE clause would.
        const matched = db.rows.filter((r) =>
          Object.entries(filters).every(([k, v]) => filterMatches(k, (r as any)[k], v)),
        );
        for (const r of matched) Object.assign(r, pending, { updated_at: asTimestamptz(pending.updated_at) });
        return Promise.resolve(resolve({ data: matched.map((r) => ({ updated_at: r.updated_at })), error: null }));
      }
      if (action === 'delete') {
        db.rows = db.rows.filter((r) => r.user_id !== filters.user_id);
        return Promise.resolve(resolve({ data: null, error: null }));
      }
      const row = db.rows.find((r) => r.user_id === filters.user_id) ?? null;
      return Promise.resolve(resolve({ data: row, error: null }));
    },
  };
  return api;
}

export const supabase = { from: (_table: string) => builder() };
