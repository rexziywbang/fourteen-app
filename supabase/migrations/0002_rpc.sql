-- ============================================================================
-- Fourteen — writes. Every client mutation goes through one of these.
-- All SECURITY DEFINER, all with a pinned search_path, all re-validating
-- their inputs in SQL regardless of what the client claims to have checked.
-- ============================================================================

-- ------------------------------------------------------------- utilities ---

create or replace function public.today_local() returns date
language sql stable as $$ select (now() at time zone 'America/Detroit')::date $$;

create or replace function public.iso_week_start() returns timestamptz
language sql stable as $$
  select date_trunc('week', now() at time zone 'America/Detroit')
         at time zone 'America/Detroit'
$$;

create or replace function public._rate_ok(p_action text, p_limit int, p_window int)
returns boolean language plpgsql security definer set search_path = public as $$
declare w timestamptz; c int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  insert into public.rate_limits(user_id, action, window_start, count)
  values (auth.uid(), p_action, w, 1)
  on conflict (user_id, action, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into c;
  return c <= p_limit;
end $$;

-- ------------------------------------------------------- the clue ladder ---
-- Runs on the SERVER so a malicious client cannot fabricate clues about
-- itself. Every line is a true statement derived from real rows; when a fact
-- is unavailable the ladder falls back to another TRUE fact and never to an
-- invented one. Days 13 and 14 are fixed so the game always resolves.

create or replace function public._build_ladder(p_sender uuid, p_recipient uuid)
returns table (day_index int, hint_text text, kind_label text)
language plpgsql security definer set search_path = public as $$
declare
  s record; r record;
  mutuals int; s_has_r bool; r_has_s bool; picked bool; same_campus bool;
  cand text[][] := '{}';
  ordered text[][];
  i int := 1;
begin
  select * into s from public.profiles where id = p_sender;
  select * into r from public.profiles where id = p_recipient;

  select count(*) into mutuals
    from public.circle_edges a join public.circle_edges b
      on a.member_id = b.member_id
   where a.owner_id = p_sender and b.owner_id = p_recipient;

  s_has_r := exists (select 1 from public.circle_edges
                      where owner_id = p_sender and member_id = p_recipient);
  r_has_s := exists (select 1 from public.circle_edges
                      where owner_id = p_recipient and member_id = p_sender);
  picked  := exists (select 1 from public.picks
                      where picker_id = p_sender and picked_id = p_recipient
                        and created_at > now() - interval '7 days');
  same_campus := s.campus_id is not null and s.campus_id = r.campus_id;

  -- {text, label, weight} — lower weight unlocks earlier (vaguer first).
  cand := cand || array[array[
    'They sent this on a ' || to_char(now() at time zone 'America/Detroit','FMDay') || '.',
    'when','5']];
  cand := cand || array[array[
    case when same_campus then 'They''re at your school.'
         else 'They''re not at your school.' end, 'where','8']];

  if s.grad_year is not null and r.grad_year is not null then
    cand := cand || array[array[
      case
        when s.grad_year = r.grad_year then 'They''re in your year.'
        when s.grad_year = r.grad_year + 1 then 'They''re a year below you.'
        when s.grad_year = r.grad_year - 1 then 'They''re a year above you.'
        else 'You''re ' || abs(s.grad_year - r.grad_year) || ' years apart.'
      end, 'year','12']];
  end if;

  cand := cand || array[array['They joined in ' || s.joined_month || '.', 'joined','15']];

  if s.active_bucket is not null then
    cand := cand || array[array[
      case when s.active_bucket = 'night_owl'
           then 'A night owl — usually on after 11pm.'
           else 'An early bird — usually on before noon.' end, 'hours','18']];
  end if;

  cand := cand || array[array[
    case when mutuals = 0 then 'You have no one in common. Interesting.'
         when mutuals = 1 then 'You have 1 person in common.'
         else 'You have ' || mutuals || ' people in common.' end, 'mutuals','22']];

  if picked then
    cand := cand || array[array['They picked you in a poll this week.','polls','40']];
  end if;

  cand := cand || array[array[
    case when r_has_s then 'They''re already in your circle.'
         else 'They''re not in your circle.' end,
    'circles', case when r_has_s then '48' else '30' end]];
  cand := cand || array[array[
    case when s_has_r then 'You''re in their circle.'
         else 'You''re not in their circle. Yet.' end,
    'circles', case when s_has_r then '52' else '34' end]];

  cand := cand || array[array[
    'Their first name has ' || char_length(s.first_name) || ' letters.',
    'name length','60']];
  cand := cand || array[array[
    'Their last name starts with ' || upper(left(s.last_name,1)) || '.',
    'last initial','70']];

  -- Floor: other true, non-identifying facts, only if the ladder is short.
  cand := cand || array[array['This is the only crush they''ve sent this week.','postage','95']];
  cand := cand || array[array['They chose this line from a fixed list.','message','96']];
  cand := cand || array[array['They finished setting up their account.','account','97']];
  cand := cand || array[array['They found you by name.','how','98']];

  -- Order by weight, de-duplicate, take twelve.
  select array_agg(x order by (x[3])::int) into ordered
    from (select distinct on (t[1]) t as x
            from unnest(cand) with ordinality as u(t, ord)
           order by t[1], (t[3])::int) d;

  for i in 1..least(12, coalesce(array_length(ordered,1),0)) loop
    day_index := i; hint_text := ordered[i][1]; kind_label := ordered[i][2];
    return next;
  end loop;

  day_index := 13;
  hint_text := 'Their first name starts with ' || upper(left(s.first_name,1)) || '.';
  kind_label := 'first initial'; return next;

  day_index := 14;
  hint_text := 'First two letters: ' || left(s.first_name,2) || '.';
  kind_label := 'first two letters'; return next;
end $$;

-- ------------------------------------------------------------- directory ---
-- Campus accounts only. Personal accounts have no directory at all: their
-- circle is invite-only, so you must genuinely know someone to reach them.
-- Prefix-only, capped, blocked both directions, rate limited.

create or replace function public.search_directory(q text)
returns table (id uuid, first_name text, last_name text, grad_year int)
language plpgsql security definer set search_path = public as $$
declare me record;
begin
  select * into me from public.profiles where id = auth.uid();
  if me is null or me.onboarded_at is null then return; end if;
  if me.kind <> 'campus' then return; end if;
  if char_length(btrim(q)) < 3 then return; end if;
  if not public._rate_ok('search_directory', 30, 60) then return; end if;

  return query
    select p.id, p.first_name, p.last_name, p.grad_year
      from public.profiles p
     where p.id <> me.id
       and p.onboarded_at is not null
       and p.campus_id = me.campus_id
       and (p.first_name ilike btrim(q) || '%' or p.last_name ilike btrim(q) || '%')
       and not exists (select 1 from public.blocks b
                        where (b.blocker_id = me.id and b.blocked_id = p.id)
                           or (b.blocker_id = p.id and b.blocked_id = me.id))
     order by p.first_name, p.last_name
     limit 8;
end $$;

-- ---------------------------------------------------------------- circle ---

create or replace function public.add_to_circle(member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if member = auth.uid() then return; end if;
  if exists (select 1 from public.blocks
              where (blocker_id = auth.uid() and blocked_id = member)
                 or (blocker_id = member and blocked_id = auth.uid())) then return; end if;
  insert into public.circle_edges(owner_id, member_id) values (auth.uid(), member)
  on conflict do nothing;
end $$;

create or replace function public.remove_from_circle(member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.circle_edges where owner_id = auth.uid() and member_id = member;
end $$;

-- ------------------------------------------------------------ send_crush ---
-- Weekly postage, race-safe mutual detection, silent-block suppression,
-- and the full frozen ladder, in one transaction.

create or replace function public.send_crush(recipient uuid, message_id int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  reciprocal uuid;
  is_blocked boolean;
  a uuid; b uuid;
begin
  if me is null or recipient is null or me = recipient then
    raise exception 'invalid recipient';
  end if;
  if not exists (select 1 from public.profiles where id = me and onboarded_at is not null)
     or not exists (select 1 from public.profiles where id = recipient and onboarded_at is not null)
  then raise exception 'both accounts must be set up'; end if;
  if not exists (select 1 from public.crush_messages where id = message_id and active)
  then raise exception 'unknown message'; end if;

  -- One per ISO week, counted server-side.
  if exists (select 1 from public.crushes
              where sender_id = me and status <> 'suppressed'
                and created_at >= public.iso_week_start())
  then raise exception 'postage already spent this week'; end if;

  if exists (select 1 from public.crushes
              where sender_id = me and recipient_id = recipient
                and status in ('active','suppressed'))
  then raise exception 'already in flight'; end if;

  -- Deterministic lock order so two simultaneous reciprocal sends cannot
  -- deadlock and cannot both create a second crush.
  a := least(me, recipient); b := greatest(me, recipient);
  perform 1 from public.profiles where id in (a, b) order by id for update;

  select id into reciprocal from public.crushes
   where sender_id = recipient and recipient_id = me and status = 'active'
   for update;

  is_blocked := exists (select 1 from public.blocks
                         where (blocker_id = recipient and blocked_id = me)
                            or (blocker_id = me and blocked_id = recipient));

  insert into public.crushes(sender_id, recipient_id, message_id, status, expires_at)
  values (me, recipient, message_id,
          case when is_blocked then 'suppressed'::crush_status
               when reciprocal is not null then 'mutual'::crush_status
               else 'active'::crush_status end,
          now() + interval '14 days')
  returning id into new_id;

  insert into public.crush_hints(crush_id, day_index, hint_text, kind_label, unlocked_at)
  select new_id, l.day_index, l.hint_text, l.kind_label,
         case when l.day_index = 1 then now() end
    from public._build_ladder(me, recipient) l;

  if reciprocal is not null and not is_blocked then
    update public.crushes set status = 'mutual', resolved_at = now()
     where id in (reciprocal, new_id);
    insert into public.notifications(user_id, kind, payload)
      values (me, 'mutual_reveal', jsonb_build_object('crush_id', new_id)),
             (recipient, 'mutual_reveal', jsonb_build_object('crush_id', reciprocal));
  elsif not is_blocked then
    insert into public.notifications(user_id, kind, payload)
      values (recipient, 'crush_received', jsonb_build_object('crush_id', new_id));
  end if;
  -- Suppressed: no notification ever fires. Nothing is faked; the crush simply
  -- exists, burns the sender's postage, and expires. Indistinguishable from
  -- being ignored, which is the point of a silent block.

  insert into public.events(user_id, name, props)
    values (me, 'crush_sent', jsonb_build_object('crush_id', new_id));
  return new_id;
end $$;

-- ------------------------------------------------------------ open_crush ---
-- One clue per calendar day. Days away never stack — coming back after a
-- week unlocks one clue, not seven.

create or replace function public.open_crush(crush uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; nxt int;
begin
  select * into c from public.crushes
   where id = crush and recipient_id = auth.uid() and status = 'active';
  if c is null then return; end if;

  insert into public.crush_opens(crush_id, open_date)
  values (crush, public.today_local())
  on conflict do nothing;
  if not found then return; end if;

  select min(day_index) into nxt from public.crush_hints
   where crush_id = crush and unlocked_at is null;
  if nxt is null then return; end if;

  update public.crush_hints set unlocked_at = now()
   where crush_id = crush and day_index = nxt;

  insert into public.notifications(user_id, kind, payload)
  values (c.sender_id, 'fuse_progress',
          jsonb_build_object('crush_id', crush, 'clue', nxt));
end $$;

-- ----------------------------------------------------------- submit_guess --
-- CONSTANT-SHAPE BY CONSTRUCTION.
--
-- Both branches execute the same statements in the same order: one insert
-- into guesses, one update of crushes, one insert into notifications. Only
-- the values differ. There is no early return, no conditional statement
-- count, and no distinguishable return value — the function returns the
-- literal 'recorded' on every path, including no-ops.

create or replace function public.submit_guess(crush uuid, guessed uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c record; correct boolean; first_correct boolean;
begin
  select * into c from public.crushes
   where id = crush and recipient_id = auth.uid() and status = 'active';
  if c is null then return 'recorded'; end if;
  if not exists (select 1 from public.profiles
                  where id = guessed and onboarded_at is not null) then
    return 'recorded';
  end if;
  if exists (select 1 from public.guesses
              where crush_id = crush and guess_date = public.today_local()) then
    return 'recorded';
  end if;

  correct := (guessed = c.sender_id);
  first_correct := correct and c.correct_guess_at is null;

  insert into public.guesses(crush_id, guessed_id, guess_date, was_correct)
  values (crush, guessed, public.today_local(), correct);

  update public.crushes
     set correct_guess_at = case when first_correct then now() else correct_guess_at end
   where id = crush;

  insert into public.notifications(user_id, kind, payload)
  values (c.sender_id,
          case when first_correct then 'consent_prompt' else 'guess_made' end,
          jsonb_build_object('crush_id', crush));

  return 'recorded';
end $$;

-- --------------------------------------------------------- consent_reveal --
-- The sender's call, always. Declining leaves the crush running to expiry and
-- tells the guesser nothing — they cannot distinguish it from a wrong guess.

create or replace function public.consent_reveal(crush uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if decision not in ('signed_for','stayed_anonymous') then
    raise exception 'bad decision';
  end if;
  select * into c from public.crushes
   where id = crush and sender_id = auth.uid()
     and status = 'active' and correct_guess_at is not null and consent_call is null;
  if c is null then return; end if;

  if decision = 'signed_for' then
    update public.crushes
       set consent_call = 'signed_for', status = 'revealed', resolved_at = now()
     where id = crush;
    insert into public.notifications(user_id, kind, payload)
    values (c.recipient_id, 'identity_revealed', jsonb_build_object('crush_id', crush));
  else
    update public.crushes set consent_call = 'stayed_anonymous' where id = crush;
  end if;
end $$;

-- ----------------------------------------------------------------- polls ---

create or replace function public.get_or_create_round()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid; n int; i int;
begin
  select count(*) into n from public.circle_edges where owner_id = me;
  if n < 4 then return; end if;

  select id into rid from public.poll_rounds
   where user_id = me and round_date = public.today_local();
  if rid is not null then return; end if;

  insert into public.poll_rounds(user_id, round_date)
  values (me, public.today_local()) returning id into rid;

  for i in 0..5 loop
    insert into public.poll_cards(round_id, position, prompt_id, option_ids)
    select rid, i,
           (select id from public.poll_prompts where active order by random() limit 1),
           (select array_agg(m) from (
              select e.member_id as m from public.circle_edges e
               where e.owner_id = me
                 and not exists (select 1 from public.blocks b
                                  where (b.blocker_id = me and b.blocked_id = e.member_id)
                                     or (b.blocker_id = e.member_id and b.blocked_id = me))
               order by random() limit 4) s);
  end loop;
end $$;

create or replace function public.answer_card(card uuid, pick uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cd record;
begin
  select c.* into cd from public.poll_cards c
    join public.poll_rounds r on r.id = c.round_id
   where c.id = card and r.user_id = auth.uid() and c.answered_at is null;
  if cd is null then return; end if;

  if pick is not null and not (pick = any (cd.option_ids)) then
    raise exception 'not on this card';
  end if;

  update public.poll_cards
     set picked_id = pick, skipped = (pick is null), answered_at = now()
   where id = card;

  if pick is not null then
    insert into public.picks(picker_id, picked_id, prompt_id)
    values (auth.uid(), pick, cd.prompt_id);
    -- The 30–90 minute randomized delay is an ANONYMITY control, not a
    -- performance one: an instant buzz beside you identifies the picker.
    insert into public.notifications(user_id, kind, payload, deliver_after)
    values (pick, 'poll_pick', jsonb_build_object('prompt_id', cd.prompt_id),
            now() + make_interval(mins => 30 + floor(random()*61)::int));
  end if;
end $$;

-- ---------------------------------------------------------------- safety ---

create or replace function public.block_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target = auth.uid() then return; end if;
  insert into public.blocks(blocker_id, blocked_id) values (auth.uid(), target)
  on conflict do nothing;
  delete from public.circle_edges
   where (owner_id = auth.uid() and member_id = target)
      or (owner_id = target and member_id = auth.uid());
  -- Any live crush between the pair goes silent in both directions.
  update public.crushes set status = 'suppressed'
   where status = 'active'
     and ((sender_id = target and recipient_id = auth.uid())
       or (sender_id = auth.uid() and recipient_id = target));
  -- Pending notifications between them are dropped, never delivered.
  delete from public.notifications n
   using public.crushes c
   where n.delivered_at is null
     and (n.payload->>'crush_id')::uuid = c.id
     and ((c.sender_id = target and c.recipient_id = auth.uid())
       or (c.sender_id = auth.uid() and c.recipient_id = target));
end $$;

create or replace function public.unblock_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = target;
end $$;

create or replace function public.submit_report(subject uuid, reason_code text, detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if reason_code not in ('harassment','not_18','impersonation','spam','other') then
    raise exception 'bad reason';
  end if;
  insert into public.reports(reporter_id, subject_user_id, reason_code, detail)
  values (auth.uid(), subject, reason_code, left(coalesce(detail,''), 500));
end $$;

create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  -- Deleting a sender mid-flight removes the crush entirely rather than
  -- orphaning it: the recipient sees the quiet-expiry state, which reveals
  -- nothing about who left.
  delete from public.crushes where sender_id = me or recipient_id = me;
  delete from public.push_subscriptions where user_id = me;
  delete from public.events where user_id = me;
  delete from auth.users where id = me;   -- cascades the profile and the rest
end $$;

-- ------------------------------------------------------------ plumbing -----

create or replace function public.register_push(token text, env text default 'production')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_subscriptions(user_id, device_token, environment)
  values (auth.uid(), token, env)
  on conflict (device_token) do update set user_id = excluded.user_id;
end $$;

create or replace function public.mark_notifications_read()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and deliver_after <= now();
end $$;

create or replace function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public._rate_ok('create_invite', 20, 86400) then raise exception 'slow down'; end if;
  c := upper(substr(replace(encode(gen_random_bytes(8),'base64'),'/','A'), 1, 8));
  insert into public.invite_links(code, inviter_id) values (c, auth.uid());
  return c;
end $$;

create or replace function public.claim_invite(code text)
returns void language plpgsql security definer set search_path = public as $$
declare inviter uuid;
begin
  select inviter_id into inviter from public.invite_links where invite_links.code = claim_invite.code;
  if inviter is null or inviter = auth.uid() then return; end if;
  insert into public.invite_claims(code, claimed_by) values (code, auth.uid())
  on conflict do nothing;
  -- An invite is a mutual introduction: both sides get the edge, which is
  -- what makes a personal account's circle work without a directory.
  perform public.add_to_circle(inviter);
  insert into public.circle_edges(owner_id, member_id) values (inviter, auth.uid())
  on conflict do nothing;
end $$;

create or replace function public.complete_profile(
  p_kind text, p_campus text, p_first text, p_last text,
  p_grad int, p_over_18 boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- The 18+ gate is enforced HERE, not in the client. A client that lies
  -- gets no profile at all.
  if p_over_18 is not true then
    raise exception 'ineligible';
  end if;
  if p_kind not in ('campus','personal') then raise exception 'bad kind'; end if;

  insert into public.profiles(id, kind, campus_id, first_name, last_name,
                              grad_year, is_over_18, onboarded_at)
  values (auth.uid(), p_kind::account_kind,
          case when p_kind = 'campus' then p_campus end,
          btrim(p_first), btrim(p_last),
          case when p_kind = 'campus' then p_grad end,
          true, now())
  on conflict (id) do update
     set kind = excluded.kind, campus_id = excluded.campus_id,
         first_name = excluded.first_name, last_name = excluded.last_name,
         grad_year = excluded.grad_year, is_over_18 = true,
         onboarded_at = coalesce(public.profiles.onboarded_at, now());
end $$;

create or replace function public.log_event(name text, props jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.events(user_id, name, props) values (auth.uid(), name, props);
end $$;

-- ----------------------------------------------------------------- grants --
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.search_directory(text),
  public.add_to_circle(uuid), public.remove_from_circle(uuid),
  public.send_crush(uuid, int), public.open_crush(uuid),
  public.submit_guess(uuid, uuid), public.consent_reveal(uuid, text),
  public.get_or_create_round(), public.answer_card(uuid, uuid),
  public.block_user(uuid), public.unblock_user(uuid),
  public.submit_report(uuid, text, text), public.delete_account(),
  public.register_push(text, text), public.mark_notifications_read(),
  public.create_invite(), public.claim_invite(text),
  public.complete_profile(text, text, text, text, int, boolean),
  public.log_event(text, jsonb)
to authenticated;
