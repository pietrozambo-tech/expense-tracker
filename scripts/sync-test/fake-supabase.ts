// Stand-in for src/app/lib/supabase.ts: an in-memory table behaving like the
// real one for the calls cloud.ts makes - crucially, a conditional UPDATE
// matches zero rows when the filter does not match, which is what makes the
// version check work in Postgres.
type Row = { user_id: string; data: unknown; updated_at: string };

export const db: { rows: Row[] } = { rows: [] };

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
        db.rows.push({ ...pending });
        return Promise.resolve(resolve({ data: [pending], error: null }));
      }
      if (action === 'update') {
        // Every eq() must match, exactly as the WHERE clause would.
        const matched = db.rows.filter((r) =>
          Object.entries(filters).every(([k, v]) => (r as any)[k] === v),
        );
        for (const r of matched) Object.assign(r, pending);
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
