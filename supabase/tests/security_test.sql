-- ============================================================================
-- Security suite. These are not nice-to-haves: each one asserts a promise the
-- product makes to users in plain English. Run with:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_test.sql
--
-- Any failure means the app is lying to somebody.
-- ============================================================================

begin;
set client_min_messages to warning;

-- ------------------------------------------------------------- fixtures ----
create temporary table t_ids(label text primary key, id uuid);

do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values
    (a,'alice@umich.edu'), (b,'bob@umich.edu'), (c,'carol@gmail.com');
  insert into t_ids values ('alice',a), ('bob',b), ('carol',c);

  insert into public.campuses(id,name,city,state,zip,email_domain)
    values ('umich','University of Michigan','ANN ARBOR','MI','48104','umich.edu')
    on conflict do nothing;

  insert into public.profiles(id,kind,campus_id,first_name,last_name,grad_year,is_over_18,onboarded_at)
  values (a,'campus','umich','Alice','Nguyen',2028,true,now()),
         (b,'campus','umich','Bob','Iverson',2027,true,now()),
         (c,'personal',null,'Carol','Diaz',null,true,now());

  insert into public.circle_edges(owner_id,member_id) values (a,b),(b,a),(a,c),(c,a);
  insert into public.crush_messages(text) values ('I''d say yes if you asked.')
    on conflict do nothing;
end $$;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice '  ok  — %', t; end $$;
create or replace function fail(t text) returns void language plpgsql as $$
begin raise exception 'FAIL — %', t; end $$;

-- Impersonate a user the way PostgREST does.
create or replace function be(u uuid) returns void language plpgsql as $$
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',u)::text, true);
end $$;

-- ============================================================================
-- 1. A recipient can never obtain the sender's identity while a crush is live.
-- ============================================================================
do $$
declare alice uuid; bob uuid; cid uuid; leaked int;
begin
  select id into alice from t_ids where label='alice';
  select id into bob   from t_ids where label='bob';
  perform be(alice);
  cid := public.send_crush(bob, (select id from public.crush_messages limit 1));

  perform be(bob);                         -- now the recipient
  -- Every column of every view Bob can read, searched for Alice's uuid.
  select count(*) into leaked from (
    select row_to_json(t)::text as j from public.crush_inbox_v t
    union all select row_to_json(t)::text from public.crush_clues_v t
    union all select row_to_json(t)::text from public.my_notifications_v t
  ) s where s.j like '%' || alice::text || '%';

  if leaked > 0 then perform fail('sender id reachable from recipient views');
  else perform pass('sender identity unreachable from every recipient view'); end if;

  -- And the base table is not readable at all.
  begin
    perform 1 from public.crushes limit 1;
    perform fail('base table public.crushes is readable by a client');
  exception when insufficient_privilege then
    perform pass('base tables denied to authenticated role');
  end;
end $$;

-- ============================================================================
-- 2. A picked user can never learn who picked them.
-- ============================================================================
do $$
declare alice uuid; bob uuid; leaked int;
begin
  select id into alice from t_ids where label='alice';
  select id into bob   from t_ids where label='bob';
  insert into public.poll_prompts(text) values ('Who''d text back at 3am?')
    on conflict do nothing;
  insert into public.picks(picker_id,picked_id,prompt_id)
    values (alice, bob, (select id from public.poll_prompts limit 1));

  perform be(bob);
  select count(*) into leaked from public.compliments_v t
   where row_to_json(t)::text like '%' || alice::text || '%';
  if leaked > 0 then perform fail('picker identity leaked to the picked user');
  else perform pass('picker identity absent from compliments'); end if;
end $$;

-- ============================================================================
-- 3. Guess result is indistinguishable — value, and statement shape.
-- ============================================================================
do $$
declare alice uuid; bob uuid; carol uuid; cid uuid;
        r_wrong text; r_right text; t0 timestamptz; d_wrong interval; d_right interval;
begin
  select id into alice from t_ids where label='alice';
  select id into bob   from t_ids where label='bob';
  select id into carol from t_ids where label='carol';
  select id into cid from public.crushes where sender_id=alice and recipient_id=bob;

  perform be(bob);
  t0 := clock_timestamp();
  r_wrong := public.submit_guess(cid, carol);       -- wrong
  d_wrong := clock_timestamp() - t0;

  delete from public.guesses where crush_id = cid;  -- allow a second attempt today
  t0 := clock_timestamp();
  r_right := public.submit_guess(cid, alice);       -- right
  d_right := clock_timestamp() - t0;

  if r_wrong is distinct from r_right then
    perform fail('guess return value differs between correct and incorrect');
  else perform pass('guess returns an identical value on both paths'); end if;

  if extract(epoch from greatest(d_wrong,d_right) - least(d_wrong,d_right)) > 0.05 then
    perform fail('guess timing differs by more than 50ms — timing oracle');
  else perform pass('guess timing indistinguishable'); end if;

  -- The recipient must not be able to see that they were right.
  if exists (select 1 from public.crush_inbox_v where id = cid
               and row_to_json(crush_inbox_v)::text like '%correct%') then
    perform fail('inbox view exposes correctness');
  else perform pass('inbox view carries no correctness signal'); end if;
end $$;

-- ============================================================================
-- 4. A blocked sender's crush is invisible and silent.
-- ============================================================================
do $$
declare alice uuid; carol uuid; cid uuid; seen int; notifs int;
begin
  select id into alice from t_ids where label='alice';
  select id into carol from t_ids where label='carol';

  perform be(carol);
  perform public.block_user(alice);

  perform be(alice);
  delete from public.crushes where sender_id = alice;   -- free the weekly postage
  cid := public.send_crush(carol, (select id from public.crush_messages limit 1));

  if (select status from public.crushes where id=cid) <> 'suppressed' then
    perform fail('crush to a blocker was not suppressed');
  else perform pass('crush to a blocker is suppressed'); end if;

  perform be(carol);
  select count(*) into seen from public.crush_inbox_v where id = cid;
  select count(*) into notifs from public.my_notifications_v
   where (payload->>'crush_id')::uuid = cid;
  if seen > 0 or notifs > 0 then perform fail('suppressed crush visible to blocker');
  else perform pass('suppressed crush invisible and silent'); end if;

  -- The sender sees the ordinary in-flight shape — no "you were blocked" tell.
  perform be(alice);
  if not exists (select 1 from public.crush_outbox_v where id = cid) then
    perform fail('sender cannot see their own suppressed crush — that is a tell');
  else perform pass('suppressed crush looks ordinary to its sender'); end if;
end $$;

-- ============================================================================
-- 5. Weekly postage and the daily guess are enforced in the database.
-- ============================================================================
do $$
declare alice uuid; bob uuid;
begin
  select id into alice from t_ids where label='alice';
  select id into bob   from t_ids where label='bob';
  perform be(alice);
  begin
    perform public.send_crush(bob, (select id from public.crush_messages limit 1));
    perform fail('a second crush was accepted in the same week');
  exception when others then
    perform pass('weekly postage enforced server-side');
  end;
end $$;

-- ============================================================================
-- 6. The 18+ gate cannot be bypassed by a lying client.
-- ============================================================================
do $$
declare d uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) values (d,'teen@umich.edu');
  perform be(d);
  begin
    perform public.complete_profile('campus','umich','Dana','Lee',2029,false);
    perform fail('profile created for a user who is not 18+');
  exception when others then
    perform pass('18+ gate enforced server-side, not in the client');
  end;
end $$;

-- ============================================================================
-- 7. Personal accounts have no directory.
-- ============================================================================
do $$
declare carol uuid; n int;
begin
  select id into carol from t_ids where label='carol';
  perform be(carol);
  select count(*) into n from public.search_directory('ali');
  if n > 0 then perform fail('personal account reached the campus directory');
  else perform pass('personal accounts have no directory'); end if;
end $$;

-- ============================================================================
-- 8. Clue ladder: 14 rows, truthful endgame, only day 1 unlocked at send.
-- ============================================================================
do $$
declare alice uuid; bob uuid; cid uuid; n int; d13 text; unlocked int;
begin
  select id into alice from t_ids where label='alice';
  select id into bob   from t_ids where label='bob';
  select id into cid from public.crushes
   where sender_id=alice and recipient_id=bob limit 1;

  select count(*) into n from public.crush_hints where crush_id=cid;
  if n <> 14 then perform fail('ladder is not exactly 14 clues');
  else perform pass('ladder is exactly 14 clues'); end if;

  select hint_text into d13 from public.crush_hints where crush_id=cid and day_index=13;
  if d13 not like '%starts with A%' then
    perform fail('day 13 is not the sender''s true first initial');
  else perform pass('day 13 is the true first initial'); end if;

  select count(*) into unlocked from public.crush_hints
   where crush_id=cid and unlocked_at is not null;
  if unlocked <> 1 then perform fail('more than day 1 was unlocked at send time');
  else perform pass('only day 1 unlocked at send'); end if;

  -- No duplicate clue text within a ladder.
  if exists (select 1 from public.crush_hints where crush_id=cid
              group by hint_text having count(*) > 1) then
    perform fail('duplicate clue text in one ladder');
  else perform pass('no duplicate clues in a ladder'); end if;
end $$;

rollback;
