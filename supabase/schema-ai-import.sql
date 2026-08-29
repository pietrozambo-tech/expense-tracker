-- Expense Tracker — the daily cap on in-app imports
--
-- WHY THIS TABLE EXISTS, AND WHY IT COMES FIRST
--
-- The convert-import Edge Function spends the project owner's Anthropic key.
-- Every other limit in the app protects the user from a mistake; this one
-- protects the owner from a bill. It is written before the function so the
-- function cannot exist without something to count against - a cap added
-- afterwards is a cap that was absent for however long "afterwards" took.
--
-- One row per user per UTC day. Nothing about the file, nothing about the
-- content: an account, a date, and how many times it asked.
--
-- Paste this into the Supabase dashboard → SQL Editor → New query → Run.

create table if not exists public.ai_import_usage (
  user_id     uuid not null references auth.users (id) on delete cascade,
  day         date not null,
  conversions int  not null default 0,
  -- What it cost, so "is this affordable at twenty users" stops being a guess.
  tokens_in   bigint not null default 0,
  tokens_out  bigint not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- No client may read or write this table, in either direction. Reading is not
-- a user capability (the remaining count comes back in the function's own
-- reply, which the caller has already been authenticated for), and writing is
-- the whole thing being defended. RLS with no policies denies everything to
-- anon and authenticated; the function reaches it with the service role.
alter table public.ai_import_usage enable row level security;

-- Claim one conversion, atomically.
--
-- The obvious shape - read the count, compare it to the cap, then write - has
-- a gap between the read and the write, and two taps in the same second both
-- see the old number and both proceed. Small, and the wrong kind of small:
-- the one thing this table exists to make impossible.
--
-- So the check IS the write. The WHERE on the conflict branch means the update
-- simply does not happen once the cap is reached, and a statement that updated
-- nothing returns nothing - which is how the caller learns it was refused,
-- without a second query that could itself race.
--
-- Returns the new count on success, and no row at all when the cap is spent.
create or replace function public.ai_import_claim(p_user uuid, p_limit int)
returns int
language sql
as $$
  insert into public.ai_import_usage (user_id, day, conversions)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set conversions = ai_import_usage.conversions + 1,
        updated_at  = now()
    where ai_import_usage.conversions < p_limit
  returning ai_import_usage.conversions;
$$;

-- Give one back.
--
-- The claim happens before the model is called, because the alternative -
-- spend first, count after - cannot enforce a cap at all. The cost is that a
-- request which dies before spending anything (the API unreachable, a network
-- drop) would still burn a credit, and the user would have paid a day's
-- allowance for nothing that happened. So the function releases the claim on
-- exactly that path.
--
-- greatest(...,0) because a release that ran twice must not lend the caller a
-- conversion it never had.
create or replace function public.ai_import_release(p_user uuid)
returns void
language sql
as $$
  update public.ai_import_usage
     set conversions = greatest(conversions - 1, 0),
         updated_at  = now()
   where user_id = p_user
     and day = (now() at time zone 'utc')::date;
$$;

-- Record what it actually cost, once the answer is in hand.
create or replace function public.ai_import_spent(p_user uuid, p_in bigint, p_out bigint)
returns void
language sql
as $$
  update public.ai_import_usage
     set tokens_in  = tokens_in  + p_in,
         tokens_out = tokens_out + p_out,
         updated_at = now()
   where user_id = p_user
     and day = (now() at time zone 'utc')::date;
$$;

-- Only the function may call these, and the function is the only thing holding
-- the service role. A signed-in browser calling ai_import_release in a loop
-- would otherwise have an unlimited allowance.
revoke all on function public.ai_import_claim(uuid, int) from public, anon, authenticated;
revoke all on function public.ai_import_release(uuid) from public, anon, authenticated;
revoke all on function public.ai_import_spent(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ai_import_claim(uuid, int) to service_role;
grant execute on function public.ai_import_release(uuid) to service_role;
grant execute on function public.ai_import_spent(uuid, bigint, bigint) to service_role;
