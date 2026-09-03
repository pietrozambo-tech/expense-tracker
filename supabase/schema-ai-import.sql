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
create table if not exists public.ai_import_reads (
  user_id   uuid not null references auth.users (id) on delete cascade,
  day       date not null,
  -- The id the app mints for one import. Every part of a split carries it.
  import_id text not null,
  reads     int  not null default 0,
  released  boolean not null default false,
  primary key (user_id, day, import_id)
);
alter table public.ai_import_reads enable row level security;

-- Claim the day's credit for an IMPORT, not for a request.
--
-- A long file cannot be answered in one call: the platform kills an Edge
-- Function at 150 seconds of wall clock, so the app cuts the file up and
-- reads the parts at the same time. Charging per request would mean one file
-- the user picked costing five of their ten, which is not what they did.
--
-- So the parts share an import_id and only the FIRST one to arrive claims.
-- The rest are recognised and let through free. Two guards make that safe:
--
--   p_max_reads   an import_id is not a licence. Reused all day it would be
--                 unlimited free reads, so one import may spend at most this
--                 many - a known multiplier on the cap, not an open door.
--   the ordering  the reads row is written FIRST, and its upsert is what
--                 serialises the parts. Parts fired together therefore
--                 cannot both believe they are the first.
--
-- Returns the day's count on success, and no row at all when refused - by the
-- daily cap or by p_max_reads. Called with p_import null (an older client) it
-- behaves exactly as it always did: one claim per request.
create or replace function public.ai_import_claim(
  p_user uuid,
  p_limit int,
  p_import text default null,
  p_max_reads int default 8
)
returns int
language plpgsql
as $$
declare
  d    date := (now() at time zone 'utc')::date;
  n    int;
  used int;
begin
  if p_import is null then
    insert into public.ai_import_usage (user_id, day, conversions)
    values (p_user, d, 1)
    on conflict (user_id, day) do update
      set conversions = ai_import_usage.conversions + 1,
          updated_at  = now()
      where ai_import_usage.conversions < p_limit
    returning conversions into n;
    return n;
  end if;

  insert into public.ai_import_reads (user_id, day, import_id, reads)
  values (p_user, d, p_import, 1)
  on conflict (user_id, day, import_id) do update
    set reads = ai_import_reads.reads + 1
    where ai_import_reads.reads < p_max_reads
  returning reads into used;

  -- The upsert updated nothing: this import has had its allowance of reads.
  if used is null then
    return null;
  end if;

  -- Not the first part - the credit was taken by whichever one got here
  -- first, and this one rides on it.
  if used > 1 then
    select conversions into n
      from public.ai_import_usage
     where user_id = p_user and day = d;
    return coalesce(n, 1);
  end if;

  insert into public.ai_import_usage (user_id, day, conversions)
  values (p_user, d, 1)
  on conflict (user_id, day) do update
    set conversions = ai_import_usage.conversions + 1,
        updated_at  = now()
    where ai_import_usage.conversions < p_limit
  returning conversions into n;

  -- The cap is spent. Take the reads row back out, or this import_id would
  -- be remembered as started and its retry would be refused for the wrong
  -- reason.
  if n is null then
    delete from public.ai_import_reads
     where user_id = p_user and day = d and import_id = p_import;
    return null;
  end if;
  return n;
end;
$$;

-- Give one back.
--
-- The claim happens before the model is called, because the alternative -
-- spend first, count after - cannot enforce a cap at all. The cost is that a
-- request which dies before spending anything (the API unreachable, a network
-- drop, an answer that came to nothing) would still burn a credit, and the
-- user would have paid a day's allowance for nothing that happened. So the
-- function releases the claim on exactly those paths.
--
-- With parallel parts the release must also happen ONCE. Five parts of one
-- import failing together would otherwise hand back five credits for the one
-- that was taken, and a user could mine the cap upwards by failing on
-- purpose. The `released` flag on the reads row is what makes it once.
--
-- greatest(...,0) because a release that ran twice must not lend the caller a
-- conversion it never had.
create or replace function public.ai_import_release(p_user uuid, p_import text default null)
returns void
language plpgsql
as $$
declare
  d   date := (now() at time zone 'utc')::date;
  did boolean;
begin
  if p_import is not null then
    update public.ai_import_reads
       set released = true
     where user_id = p_user and day = d and import_id = p_import and released = false
    returning true into did;
    -- Another part of this import has already given the credit back.
    if did is null then
      return;
    end if;
  end if;

  update public.ai_import_usage
     set conversions = greatest(conversions - 1, 0),
         updated_at  = now()
   where user_id = p_user and day = d;
end;
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
