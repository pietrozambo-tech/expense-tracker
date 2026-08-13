-- Expense Tracker — shared expenses between two accounts
--
-- The existing model (schema.sql) is one private JSON blob per user, and that
-- stays exactly as it is: your own ledger never leaves your own row. This adds
-- a SECOND, narrow space that two accounts can both see, holding only the
-- expenses someone deliberately marked as shared.
--
-- Design notes worth keeping in mind while reading:
--
--   * A shared item is authored by one member and READ by the others. Nobody
--     can edit anybody else's row - that is enforced here, not in the client.
--   * Joining happens through a security-definer RPC, never by writing the
--     membership table directly, so a stolen household id cannot let anyone
--     in and invite codes are never readable by clients.
--   * is_household_member() is security definer on purpose: a policy on
--     household_members that queried household_members would recurse.
--
-- Paste into the Supabase dashboard → SQL Editor → New query → Run.
-- Safe to re-run: every object is created if-not-exists and every policy is
-- dropped first.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.households (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid not null references auth.users (id) on delete cascade,
  -- The household's split rule, mirroring the client's SplitRule:
  -- {"mode":"equal","ways":2} or {"mode":"percent","percent":60}
  default_split jsonb not null default '{"mode":"equal","ways":2}'::jsonb,
  -- false = split amounts but keep no balance (a joint account you both fund)
  track_balance boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Carried here so each side can show the other's name and avatar colour
  -- without ever reading the other's private row.
  display_name text not null default '',
  color        text not null default '#7C5CFF',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Short-lived join codes. Never selected by clients (no permissive policy);
-- both sides of the exchange go through the RPCs below.
create table if not exists public.household_invites (
  code         text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by   uuid not null references auth.users (id) on delete cascade,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_by      uuid references auth.users (id)
);

-- The shared ledger. `id` is client-generated and matches the author's local
-- transaction id, so publishing an edit is an idempotent upsert.
create table if not exists public.shared_items (
  id            text primary key,
  household_id  uuid not null references public.households (id) on delete cascade,
  author_id     uuid not null references auth.users (id) on delete cascade,
  -- Who actually paid. Equals author_id today; kept separate so "I paid for
  -- something they entered" stays expressible without a migration.
  payer_id      uuid not null references auth.users (id) on delete cascade,
  date          date not null,
  description   text not null default '',
  amount        numeric(14,2) not null,
  currency      text not null default 'EUR',
  -- The author's FX lock, so the other side never inherits their rates.
  base_amount   numeric(14,2),
  -- The language-independent seed id ('groceries'), which is what makes
  -- cross-account category mapping free - see docs/shared-expenses/README.md.
  category_key  text,
  -- Fallbacks for categories somebody invented: the other side maps by icon.
  category_name text,
  category_icon text,
  subcategory   text,
  -- The AUTHOR's own share. The other member's share is amount - author_share
  -- while a household has two people.
  author_share  numeric(14,2) not null,
  updated_at    timestamptz not null default now(),
  -- Tombstone rather than a hard delete: the other device has a replica to
  -- remove, and it may not be online for days.
  deleted_at    timestamptz
);

create table if not exists public.settlements (
  id           text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  from_user    uuid not null references auth.users (id) on delete cascade,
  to_user      uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  amount       numeric(14,2) not null,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists shared_items_household_updated_idx
  on public.shared_items (household_id, updated_at desc);
create index if not exists settlements_household_updated_idx
  on public.settlements (household_id, updated_at desc);
create index if not exists household_members_user_idx
  on public.household_members (user_id);

-- ── Membership test ─────────────────────────────────────────────────────────
-- security definer so it can read household_members without re-entering the
-- policies that call it. Without this, "members can see members" recurses.

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.shared_items      enable row level security;
alter table public.settlements       enable row level security;

-- households ----------------------------------------------------------------
drop policy if exists "households_select_member"  on public.households;
drop policy if exists "households_insert_creator" on public.households;
drop policy if exists "households_update_member"  on public.households;
drop policy if exists "households_delete_creator" on public.households;

create policy "households_select_member"
  on public.households for select
  using (public.is_household_member(id));

create policy "households_insert_creator"
  on public.households for insert
  with check (auth.uid() = created_by);

-- Either member may change the default split or the balance switch: it is a
-- shared setting, and one-sided edits to it would be a nastier bug than a
-- rare disagreement.
create policy "households_update_member"
  on public.households for update
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy "households_delete_creator"
  on public.households for delete
  using (auth.uid() = created_by);

-- household_members ---------------------------------------------------------
drop policy if exists "members_select_same_household" on public.household_members;
drop policy if exists "members_insert_creator_self"   on public.household_members;
drop policy if exists "members_update_self"           on public.household_members;
drop policy if exists "members_delete_self"           on public.household_members;

create policy "members_select_same_household"
  on public.household_members for select
  using (public.is_household_member(household_id));

-- Only the founder adding THEMSELVES. Everyone else arrives through
-- redeem_household_invite(), so possession of a household id is never enough
-- to join one.
create policy "members_insert_creator_self"
  on public.household_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.households h
      where h.id = household_id and h.created_by = auth.uid()
    )
  );

-- Renaming yourself; never anybody else.
create policy "members_update_self"
  on public.household_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Leaving.
create policy "members_delete_self"
  on public.household_members for delete
  using (user_id = auth.uid());

-- household_invites ---------------------------------------------------------
-- Deliberately NO policies: RLS is on and nothing is permitted, so clients
-- cannot read, guess or enumerate codes. The RPCs below are security definer
-- and are the only way in or out.

-- shared_items --------------------------------------------------------------
drop policy if exists "shared_items_select_member" on public.shared_items;
drop policy if exists "shared_items_insert_author" on public.shared_items;
drop policy if exists "shared_items_update_author" on public.shared_items;
drop policy if exists "shared_items_delete_author" on public.shared_items;

create policy "shared_items_select_member"
  on public.shared_items for select
  using (public.is_household_member(household_id));

create policy "shared_items_insert_author"
  on public.shared_items for insert
  with check (author_id = auth.uid() and public.is_household_member(household_id));

-- The author owns the amount, the date and the split. This is the rule the
-- UI states ("only she can change them") - enforced here so it is true.
create policy "shared_items_update_author"
  on public.shared_items for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "shared_items_delete_author"
  on public.shared_items for delete
  using (author_id = auth.uid());

-- settlements ---------------------------------------------------------------
drop policy if exists "settlements_select_member" on public.settlements;
drop policy if exists "settlements_insert_party"  on public.settlements;
drop policy if exists "settlements_update_party"  on public.settlements;
drop policy if exists "settlements_delete_party"  on public.settlements;

create policy "settlements_select_member"
  on public.settlements for select
  using (public.is_household_member(household_id));

-- Either side can record "we settled": the person who paid, or the person who
-- was paid and noticed first.
create policy "settlements_insert_party"
  on public.settlements for insert
  with check (
    public.is_household_member(household_id)
    and (from_user = auth.uid() or to_user = auth.uid())
  );

create policy "settlements_update_party"
  on public.settlements for update
  using (public.is_household_member(household_id) and (from_user = auth.uid() or to_user = auth.uid()))
  with check (public.is_household_member(household_id) and (from_user = auth.uid() or to_user = auth.uid()));

create policy "settlements_delete_party"
  on public.settlements for delete
  using (public.is_household_member(household_id) and (from_user = auth.uid() or to_user = auth.uid()));

-- ── Pairing RPCs ────────────────────────────────────────────────────────────

-- Mint a join code for a household you belong to. Codes are 6 characters from
-- an alphabet with no 0/O or 1/I, because they get read aloud across a
-- kitchen table. Any earlier unused code for the same household is retired,
-- so only the newest one works.
create or replace function public.create_household_invite(hid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  new_code text;
  i int;
begin
  if not public.is_household_member(hid) then
    raise exception 'not a member of this household';
  end if;

  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.household_invites where code = new_code);
  end loop;

  delete from public.household_invites
   where household_id = hid and used_at is null;

  insert into public.household_invites (code, household_id, created_by, expires_at)
  values (new_code, hid, auth.uid(), now() + interval '30 minutes');

  return new_code;
end;
$$;

revoke all on function public.create_household_invite(uuid) from public;
grant execute on function public.create_household_invite(uuid) to authenticated;

-- Redeem a code: validate, join, burn it - all in one statement so two people
-- racing on the same code cannot both get in.
create or replace function public.redeem_household_invite(invite_code text, name text, avatar_color text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invites%rowtype;
  member_count int;
begin
  select * into inv
    from public.household_invites
   where code = upper(trim(invite_code))
   for update;

  if not found then
    raise exception 'invalid code';
  end if;
  if inv.used_at is not null then
    raise exception 'code already used';
  end if;
  if inv.expires_at < now() then
    raise exception 'code expired';
  end if;
  if inv.created_by = auth.uid() then
    raise exception 'cannot join your own invite';
  end if;

  -- Two people per household for now. Lifting this is a client change (the
  -- UI is drawn for two), not a schema one.
  select count(*) into member_count
    from public.household_members
   where household_id = inv.household_id;
  if member_count >= 2 then
    raise exception 'household is full';
  end if;

  insert into public.household_members (household_id, user_id, display_name, color)
  values (inv.household_id, auth.uid(), coalesce(nullif(trim(name), ''), 'Partner'),
          coalesce(nullif(trim(avatar_color), ''), '#7C5CFF'))
  on conflict (household_id, user_id) do nothing;

  update public.household_invites
     set used_at = now(), used_by = auth.uid()
   where code = inv.code;

  return inv.household_id;
end;
$$;

revoke all on function public.redeem_household_invite(text, text, text) from public;
grant execute on function public.redeem_household_invite(text, text, text) to authenticated;
