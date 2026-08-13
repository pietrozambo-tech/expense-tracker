-- The pairing flow and its security guarantees, run against a real Postgres.
-- Each check prints PASS/FAIL; scripts/test-schema.mjs fails the build on any
-- FAIL or on an unexpected error.
\set ON_ERROR_STOP off
\set P '11111111-1111-1111-1111-111111111111'
\set G '22222222-2222-2222-2222-222222222222'
\set E '33333333-3333-3333-3333-333333333333'

insert into auth.users(id) values (:'P'),(:'G'),(:'E') on conflict do nothing;
grant execute on all functions in schema public to authenticated;

set role authenticated;
set request.jwt.claim.sub = :'P';

-- 1. Create, reading the id back exactly as the client does. This is the step
--    that failed before the creator was added to the households SELECT policy.
insert into public.households (created_by) values (auth.uid()) returning id as hid \gset
select case when :'hid' is not null then 'PASS' else 'FAIL' end || '  create household with RETURNING' as r;
insert into public.household_members (household_id,user_id,display_name,color)
  values (:'hid', auth.uid(), 'Pietro', '#0B0B0D');
select case when count(*)=1 then 'PASS' else 'FAIL' end || '  founder membership' as r
  from public.household_members where household_id = :'hid';

-- 2. Invite + redeem.
select public.create_household_invite(:'hid') as code \gset
select case when length(:'code')=6 then 'PASS' else 'FAIL' end || '  invite code minted' as r;
set request.jwt.claim.sub = :'G';
select public.redeem_household_invite(:'code','Giulia','#7C5CFF') as joined \gset
select case when :'joined' = :'hid' then 'PASS' else 'FAIL' end || '  partner joined' as r;
select case when count(*)=2 then 'PASS' else 'FAIL' end || '  both members visible to both' as r
  from public.household_members;

-- 3. A burnt code is dead.
do $$ declare c text; begin
  select code into c from public.household_invites where used_at is not null limit 1;
  begin
    perform public.redeem_household_invite(c,'X','#000');
    raise notice 'FAIL  used code rejected';
  exception when others then raise notice 'PASS  used code rejected (%)', sqlerrm; end;
end $$;

-- 4. A shared expense belongs to the household: either member may correct it,
--    and updated_by records who did. Authorship still records who entered it.
set request.jwt.claim.sub = :'P';
insert into public.shared_items (id,household_id,author_id,payer_id,date,description,amount,currency,category_key,author_share,updated_by)
  values ('tx-a', :'hid', auth.uid(), auth.uid(), '2026-08-01','Rent',900,'EUR','housing',450, auth.uid());
set request.jwt.claim.sub = :'G';
select case when count(*)=1 then 'PASS' else 'FAIL' end || '  partner sees his item' as r from public.shared_items;
update public.shared_items set amount = 950, author_share = 475, updated_by = auth.uid() where id='tx-a';
select case when amount=950 then 'PASS' else 'FAIL' end || '  partner CAN correct his item' as r
  from public.shared_items where id='tx-a';
select case when updated_by = :'G' and author_id = :'P' then 'PASS' else 'FAIL' end
  || '  authorship stays his, updated_by becomes hers' as r from public.shared_items where id='tx-a';
-- The client deletes by tombstoning, so her device can drop its copy.
update public.shared_items set deleted_at = now() where id='tx-a';
select case when deleted_at is not null then 'PASS' else 'FAIL' end || '  partner CAN retire his item' as r
  from public.shared_items where id='tx-a';
update public.shared_items set deleted_at = null where id='tx-a';
insert into public.shared_items (id,household_id,author_id,payer_id,date,description,amount,currency,category_key,author_share,updated_by)
  values ('tx-b', :'hid', auth.uid(), auth.uid(), '2026-08-03','Conad',60,'EUR','groceries',30, auth.uid());
set request.jwt.claim.sub = :'P';
select case when count(*)=2 then 'PASS' else 'FAIL' end || '  both items visible to both' as r from public.shared_items;
-- The loosening is for MEMBERS only.
set request.jwt.claim.sub = :'E';
update public.shared_items set amount = 1 where id='tx-a';
set request.jwt.claim.sub = :'P';
select case when amount=950 then 'PASS' else 'FAIL' end || '  outsider still cannot edit' as r
  from public.shared_items where id='tx-a';
set request.jwt.claim.sub = :'E';
delete from public.shared_items where id='tx-a';
set request.jwt.claim.sub = :'P';
select case when count(*)=1 then 'PASS' else 'FAIL' end || '  outsider still cannot delete' as r
  from public.shared_items where id='tx-a';

-- 5. Isolation: an outsider holding the household id gets nothing.
set request.jwt.claim.sub = :'E';
select case when count(*)=0 then 'PASS' else 'FAIL' end || '  outsider sees no items' as r from public.shared_items;
select case when count(*)=0 then 'PASS' else 'FAIL' end || '  outsider sees no members' as r from public.household_members;
select case when count(*)=0 then 'PASS' else 'FAIL' end || '  outsider sees no households' as r from public.households;
select case when count(*)=0 then 'PASS' else 'FAIL' end || '  outsider cannot read invites' as r from public.household_invites;
do $$ begin
  begin
    insert into public.household_members (household_id,user_id,display_name,color)
      select id, auth.uid(), 'Eve', '#f00' from public.households limit 1;
    if not found then raise notice 'PASS  outsider cannot join (no visible household)';
    else raise notice 'FAIL  outsider joined'; end if;
  exception when others then raise notice 'PASS  outsider cannot join (%)', sqlerrm; end;
end $$;

-- 6. Leaving takes only your own membership.
set request.jwt.claim.sub = :'G';
delete from public.household_members where user_id = auth.uid();
set request.jwt.claim.sub = :'P';
select case when count(*)=1 then 'PASS' else 'FAIL' end || '  leaving removes only the leaver' as r
  from public.household_members;
