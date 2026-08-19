-- Expense Tracker — daily activity roll-up
--
-- WHY THIS TABLE EXISTS
--
-- "How many people opened the app today" cannot be answered from auth.users.
-- The only timestamp there is last_sign_in_at, and a session lasts months: a
-- user who signed in once in July and has opened the app every day since
-- produces exactly one July timestamp and nothing else. Counting it as daily
-- activity understates by however loyal the users are.
--
-- So the app records the fact itself: one row per user per day, written on
-- launch. Nothing about what they did - a date and a user id.
--
-- Paste this into the Supabase dashboard → SQL Editor → New query → Run.

create table if not exists public.app_activity (
  user_id   uuid not null references auth.users (id) on delete cascade,
  day       date not null,
  last_seen timestamptz not null default now(),
  primary key (user_id, day)
);

-- Reading is not a user capability at all: nobody signed in may select from
-- this table, because the only interesting query spans other people's rows.
-- The developer screen reads it through the admin-stats Edge Function, which
-- uses the service role (RLS does not apply) after checking the caller
-- against ADMIN_EMAILS.
alter table public.app_activity enable row level security;

-- Dropped first so the whole file can be run again without erroring on the
-- second pass: Postgres has no "create policy if not exists", and a script
-- you cannot re-run is a script you end up afraid of.
drop policy if exists "insert own activity" on public.app_activity;
create policy "insert own activity"
  on public.app_activity for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "update own activity" on public.app_activity;
create policy "update own activity"
  on public.app_activity for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The admin window is the last 30 days, ordered by day.
create index if not exists app_activity_day_idx on public.app_activity (day desc);

-- How a device actually records its visit.
--
-- The app used to upsert the row itself, asserting its own user_id, and the
-- insert was refused: "new row violates row-level security policy". Whatever
-- made auth.uid() and that id disagree, the design invited it - a client
-- claiming who it is, and a policy checking the claim.
--
-- So the client claims nothing. This function takes no arguments: the account
-- and the day are both decided here, from the caller's own token and the
-- server's clock (UTC, matching the buckets admin-stats reports). It is
-- SECURITY DEFINER, so it does not depend on the table's policies at all, and
-- it cannot write a row for anyone but the caller because there is no
-- parameter with which to try. An unauthenticated call says so plainly rather
-- than failing as a policy violation.
create or replace function public.record_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'record_activity: no authenticated user (auth.uid() is null)';
  end if;
  insert into public.app_activity (user_id, day, last_seen)
  values (auth.uid(), (now() at time zone 'utc')::date, now())
  on conflict (user_id, day) do update set last_seen = excluded.last_seen;
end;
$$;

revoke all on function public.record_activity() from public, anon;
grant execute on function public.record_activity() to authenticated;
