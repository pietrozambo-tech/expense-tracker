-- Where the database size actually goes.
--
-- Storage on a project like this is rarely the users' data. Three things
-- inflate it far past what the rows contain:
--
--   1. DEAD TUPLES. Postgres updates by writing a new row version and marking
--      the old one dead; autovacuum reclaims the space later, and until it
--      does the table keeps both. This app stores one JSON blob per user and
--      REWRITES THE WHOLE BLOB on every change, so a user with a 1 MB ledger
--      leaves a 1 MB corpse behind on every single save. That is the design's
--      main cost, and it is invisible until you look for it.
--
--   2. auth.audit_log_entries. Supabase logs every sign-in and token refresh.
--      It grows with use, forever, and nobody thinks to look at it. (Note: it
--      is also what schema-activity-backfill.sql reads to recover history, so
--      pruning it trades old history for space - a deliberate choice, not
--      housekeeping.)
--
--   3. Indexes and TOAST. Large JSON values live in a side table; the size a
--      row "is" and the size it occupies are different numbers.
--
-- Paste into the Supabase dashboard → SQL Editor → New query → Run.

-- ── 1. The twenty largest objects, and how much of each is dead ────────────
select
  n.nspname || '.' || c.relname                       as object,
  pg_size_pretty(pg_total_relation_size(c.oid))       as total,
  pg_size_pretty(pg_relation_size(c.oid))             as heap,
  pg_size_pretty(pg_indexes_size(c.oid))              as indexes,
  s.n_live_tup                                        as live_rows,
  s.n_dead_tup                                        as dead_rows,
  s.last_autovacuum
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_all_tables s on s.relid = c.oid
where c.relkind in ('r', 'm')
  and n.nspname not in ('pg_catalog', 'information_schema')
order by pg_total_relation_size(c.oid) desc
limit 20;

-- ── 2. The whole database, for the number the billing page shows ───────────
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- ── 3. What the user data actually weighs, per account ─────────────────────
-- The honest denominator: if this is small and the table is large, the gap is
-- bloat, and no amount of paying for a bigger tier will fix the cause.
select
  count(*)                                            as rows,
  pg_size_pretty(sum(pg_column_size(data))::bigint)   as payload_total,
  pg_size_pretty(avg(pg_column_size(data))::bigint)   as payload_avg,
  pg_size_pretty(max(pg_column_size(data))::bigint)   as payload_max
from public.user_data;

-- ── 4. How much of it is the auth log ──────────────────────────────────────
select
  count(*)                                            as audit_rows,
  min(created_at)::date                               as oldest,
  pg_size_pretty(pg_total_relation_size('auth.audit_log_entries')) as audit_size
from auth.audit_log_entries;

-- ── If dead_rows dwarfs live_rows on public.user_data ──────────────────────
-- Reclaim it. VACUUM FULL takes an exclusive lock and rewrites the table - on
-- a table this size that is seconds, but do it when nobody is mid-sync.
--
--   vacuum full analyze public.user_data;
--
-- And make autovacuum keep up on a table whose every row is rewritten often:
--
--   alter table public.user_data set (
--     autovacuum_vacuum_scale_factor = 0.05,
--     autovacuum_vacuum_threshold = 20
--   );
