-- Expense Tracker — recovering activity from before the tracking
--
-- WHY
--
-- public.app_activity only knows what it has been told, and it started being
-- told on the day it was created. Everything before that looked like silence,
-- which is a claim about the users rather than about the data.
--
-- But Supabase keeps its own log: auth.audit_log_entries records every sign-in
-- and every token refresh, with a timestamp and the account it belongs to. An
-- app that is open refreshes its token; an app nobody opens does not. So the
-- distinct days in that log are a real, if approximate, record of when each
-- account was around - and it reaches back to the day they signed up.
--
-- It is a PROXY, and the developer screen says so: a token can refresh in a
-- backgrounded tab, and Supabase does not promise to keep audit rows forever.
-- Where a recorded launch exists it is preferred; this only fills the silence.
--
-- The auth schema is not exposed to the API, so the read has to happen inside
-- a SECURITY DEFINER function like this one. It is granted to service_role
-- alone - the Edge Function's identity - and explicitly revoked from the anon
-- and authenticated roles every browser holds, because "which days was this
-- person online" is not a fact any user should be able to ask about another.
--
-- Paste this into the Supabase dashboard → SQL Editor → New query → Run.

create or replace function public.activity_history(since date)
returns table (user_id uuid, day date)
language sql
security definer
set search_path = public, auth
as $$
  select distinct
    (a.payload->>'actor_id')::uuid,
    (a.created_at at time zone 'utc')::date
  from auth.audit_log_entries a
  where a.created_at >= since::timestamptz
    -- Guard the cast: a malformed or absent actor id must not error the whole
    -- query, it must simply not be a row.
    and a.payload->>'actor_id' ~ '^[0-9a-fA-F-]{36}$'
$$;

revoke all on function public.activity_history(date) from public, anon, authenticated;
grant execute on function public.activity_history(date) to service_role;
