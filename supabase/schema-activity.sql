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
