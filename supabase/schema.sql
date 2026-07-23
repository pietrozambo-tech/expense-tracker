-- Expense Tracker — per-user cloud storage
--
-- MVP model: one JSON record per user holding the whole dataset
-- (transactions, categories, sources, settings). Small data, offline cache in
-- the browser, last-write-wins across devices. Can be normalised into
-- queryable tables later (e.g. for sharing between accounts).
--
-- Paste this into the Supabase dashboard → SQL Editor → New query → Run.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: this is what protects the data. The public anon key can
-- reach the table, but these policies mean a signed-in user can only ever
-- read/write the row whose user_id equals their own auth id.
alter table public.user_data enable row level security;

create policy "user_data_select_own"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "user_data_insert_own"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "user_data_update_own"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_data_delete_own"
  on public.user_data for delete
  using (auth.uid() = user_id);
