-- Fourteen v1.1 production foundation. This migration has not been applied to a live project.
-- Browser roles are deny-all on base tables. The Next.js server uses service-role-only
-- safe views for reads and narrowly scoped security-definer RPCs for writes.

create extension if not exists pgcrypto;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create type public.crush_status as enum ('active','suppressed','mutual','revealed','expired');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  member_number bigint generated always as identity unique,
  school_email text unique not null check (school_email = lower(school_email) and school_email like '%@umich.edu'),
  first_name text check (char_length(first_name) between 1 and 30),
  last_name text check (char_length(last_name) between 1 and 30),
  class_year int check (class_year between 2027 and 2031),
  is_over_18 boolean not null default false,
  is_demo boolean not null default false,
  school text not null default 'umich' check (school = 'umich'),
  onboarded_at timestamptz,
  last_active_at timestamptz,
  active_hour_bucket text check (active_hour_bucket in ('night_owl','early_bird')),
  joined_month text not null default to_char(timezone('America/Detroit', now()), 'FMMonth'),
  created_at timestamptz not null default now()
);

create table public.login_codes (
  email text primary key references public.profiles(school_email) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0 check (attempts between 0 and 5),
  sent_at timestamptz not null
);

create table public.app_sessions (
  token_hash text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index app_sessions_profile_idx on public.app_sessions(profile_id);

create table public.circle_edges (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.crush_messages (
  id serial primary key,
  text text unique not null,
  active boolean not null default true
);

create table public.crushes (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message_id int not null references public.crush_messages(id),
  status public.crush_status not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  correct_guess_at timestamptz,
  consent_decision text check (consent_decision in ('revealed','kept_hidden')),
  resolved_at timestamptz,
  check (sender_id <> recipient_id)
);
create unique index one_live_crush on public.crushes(sender_id, recipient_id)
  where status in ('active','suppressed');
create index crush_recipient_idx on public.crushes(recipient_id, created_at desc);
create index crush_sender_idx on public.crushes(sender_id, created_at desc);

create table public.crush_hints (
  crush_id uuid not null references public.crushes(id) on delete cascade,
  day_index int not null check (day_index between 1 and 14),
  hint_text text not null,
  unlocked_at timestamptz,
  primary key (crush_id, day_index)
);

create table public.crush_opens (
  crush_id uuid not null references public.crushes(id) on delete cascade,
  open_date date not null,
  created_at timestamptz not null default now(),
  primary key (crush_id, open_date)
);

create table public.guesses (
  id uuid primary key default gen_random_uuid(),
  crush_id uuid not null references public.crushes(id) on delete cascade,
  guessed_id uuid not null references public.profiles(id) on delete cascade,
  guess_date date not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (crush_id, guess_date)
);

create table public.poll_prompts (
  id serial primary key,
  text unique not null,
  active boolean not null default true
);

create table public.poll_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, round_date)
);

create table public.poll_cards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.poll_rounds(id) on delete cascade,
  position int not null check (position between 0 and 5),
  prompt_id int not null references public.poll_prompts(id),
  option_ids uuid[] not null check (array_length(option_ids, 1) = 4),
  picked_id uuid references public.profiles(id) on delete set null,
  skipped boolean not null default false,
  answered_at timestamptz,
  unique (round_id, position)
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  picker_id uuid not null references public.profiles(id) on delete cascade,
  picked_id uuid not null references public.profiles(id) on delete cascade,
  prompt_id int not null references public.poll_prompts(id),
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  dedupe_key text unique,
  deliver_after timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  email_sent_at timestamptz,
  attempt_count int not null default 0,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_outbox_idx on public.notifications(deliver_after)
  where delivered_at is null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_user_id uuid references public.profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  window_start bigint not null,
  count int not null default 1,
  primary key (user_id, action, window_start)
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  action text not null,
  object_type text not null,
  object_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Deny access to every base table from browser roles. Service-role operations remain server-only.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','login_codes','app_sessions','circle_edges','blocks','crush_messages','crushes',
    'crush_hints','crush_opens','guesses','poll_prompts','poll_rounds','poll_cards','picks',
    'push_subscriptions','notifications','reports','events','rate_limits','admin_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end $$;

-- Safe read surfaces. The viewer_id column is filtered by the trusted Next.js adapter and
-- never returned to client components. No inbox surface contains sender_id or picker_id.
create view public.circle_server_v as
  select e.owner_id as viewer_id, p.id, p.first_name, p.last_name, p.class_year, p.is_demo
  from public.circle_edges e join public.profiles p on p.id = e.member_id
  where not exists (select 1 from public.blocks b where
    (b.blocker_id = e.owner_id and b.blocked_id = e.member_id)
    or (b.blocker_id = e.member_id and b.blocked_id = e.owner_id));

create view public.crush_inbox_server_v as
  select c.recipient_id as viewer_id, c.id, c.message_id, c.status, c.created_at, c.expires_at,
    count(h.day_index) filter (where h.unlocked_at is not null)::int as hints_unlocked
  from public.crushes c left join public.crush_hints h on h.crush_id = c.id
  where c.status <> 'suppressed'
  group by c.id;

create view public.crush_outbox_server_v as
  select c.sender_id as viewer_id, c.id, c.message_id,
    case when c.status = 'suppressed' then 'active'::public.crush_status else c.status end as status,
    c.created_at, c.expires_at,
    c.correct_guess_at, c.consent_decision, p.first_name as recipient_first_name,
    p.last_name as recipient_last_name,
    count(h.day_index) filter (where h.unlocked_at is not null)::int as hints_unlocked
  from public.crushes c join public.profiles p on p.id = c.recipient_id
  left join public.crush_hints h on h.crush_id = c.id
  group by c.id, p.id;

create view public.recipient_hints_server_v as
  select c.recipient_id as viewer_id, h.crush_id, h.day_index,
    case when h.unlocked_at is not null then h.hint_text else null end as hint_text,
    h.unlocked_at
  from public.crush_hints h join public.crushes c on c.id = h.crush_id
  where c.status <> 'suppressed';

create view public.sender_hints_server_v as
  select c.sender_id as viewer_id, h.crush_id, h.day_index, h.unlocked_at
  from public.crush_hints h join public.crushes c on c.id = h.crush_id;

create view public.compliments_server_v as
  select p.picked_id as viewer_id, p.id, pp.text as prompt_text, p.created_at
  from public.picks p join public.poll_prompts pp on pp.id = p.prompt_id
  where not exists (select 1 from public.blocks b where
    (b.blocker_id = p.picker_id and b.blocked_id = p.picked_id)
    or (b.blocker_id = p.picked_id and b.blocked_id = p.picker_id));

create view public.blocked_people_server_v as
  select b.blocker_id as viewer_id, p.id, p.first_name, p.last_name, p.class_year
  from public.blocks b join public.profiles p on p.id = b.blocked_id;

create view public.notifications_server_v as
  select user_id as viewer_id, id, kind, payload, created_at
  from public.notifications where deliver_after <= now();

create view public.reveal_server_v as
  select viewers.viewer_id, c.id, c.status, c.resolved_at,
    sender.id as sender_id, sender.first_name as sender_first_name,
    recipient.id as recipient_id, recipient.first_name as recipient_first_name
  from public.crushes c
  join public.profiles sender on sender.id = c.sender_id
  join public.profiles recipient on recipient.id = c.recipient_id
  cross join lateral (values (c.sender_id), (c.recipient_id)) viewers(viewer_id)
  where c.status in ('mutual','revealed');

create view public.report_history_server_v as
  select reporter_id as viewer_id, id, created_at, resolved_at from public.reports;

revoke all on public.circle_server_v, public.crush_inbox_server_v, public.crush_outbox_server_v,
  public.recipient_hints_server_v, public.sender_hints_server_v, public.compliments_server_v,
  public.blocked_people_server_v, public.notifications_server_v, public.reveal_server_v, public.report_history_server_v
  from anon, authenticated;
grant select on public.circle_server_v, public.crush_inbox_server_v, public.crush_outbox_server_v,
  public.recipient_hints_server_v, public.sender_hints_server_v, public.compliments_server_v,
  public.blocked_people_server_v, public.notifications_server_v, public.reveal_server_v, public.report_history_server_v
  to service_role;

create or replace function public.create_or_find_signup(p_email text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  if lower(trim(p_email)) !~ '^[^@[:space:]]+@umich[.]edu$' then raise exception 'Invalid school email'; end if;
  insert into public.profiles(school_email) values (lower(trim(p_email)))
    on conflict (school_email) do nothing;
  select * into result from public.profiles where school_email = lower(trim(p_email));
  return result;
end $$;

create or replace function public.save_login_code(p_email text, p_code_hash text)
returns void language sql security definer set search_path = public as $$
  insert into public.login_codes(email, code_hash, expires_at, attempts, sent_at)
  values (lower(p_email), p_code_hash, now() + interval '10 minutes', 0, now())
  on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at,
    attempts = 0, sent_at = excluded.sent_at;
$$;

create or replace function public.increment_login_attempt(p_email text)
returns void language sql security definer set search_path = public as $$
  update public.login_codes set attempts = least(5, attempts + 1) where email = lower(p_email);
$$;

create or replace function public.delete_login_code(p_email text)
returns void language sql security definer set search_path = public as $$
  delete from public.login_codes where email = lower(p_email);
$$;

create or replace function public.create_app_session(p_profile_id uuid, p_token_hash text)
returns void language sql security definer set search_path = public as $$
  insert into public.app_sessions(token_hash, profile_id, expires_at)
  values (p_token_hash, p_profile_id, now() + interval '30 days');
$$;

create or replace function public.delete_app_session(p_token_hash text)
returns void language sql security definer set search_path = public as $$
  delete from public.app_sessions where token_hash = p_token_hash;
$$;

create or replace function public.session_profile(p_token_hash text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  delete from public.app_sessions where expires_at <= now();
  select p.* into result from public.app_sessions s join public.profiles p on p.id = s.profile_id
    where s.token_hash = p_token_hash and s.expires_at > now();
  if result.id is not null then update public.profiles set last_active_at = now() where id = result.id; end if;
  return result;
end $$;

create or replace function public.complete_onboarding(
  p_actor uuid, p_birth_date date, p_first_name text, p_last_name text, p_class_year int, p_circle_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
begin
  if trim(p_first_name) = '' or trim(p_last_name) = '' or p_class_year not between 2027 and 2031 then
    raise exception 'Invalid profile';
  end if;
  if p_birth_date is null or p_birth_date > timezone('America/Detroit', now())::date - interval '18 years' then
    raise exception 'You must be 18 or older';
  end if;
  update public.profiles set first_name = trim(p_first_name), last_name = trim(p_last_name),
    class_year = p_class_year, is_over_18 = true, onboarded_at = now(), last_active_at = now()
    where id = p_actor;
  insert into public.circle_edges(owner_id, member_id)
    select p_actor, id from public.profiles where id = any(p_circle_ids) and id <> p_actor and onboarded_at is not null
    on conflict do nothing;
  insert into public.events(user_id, name, props) values (p_actor, 'onboarded', jsonb_build_object('circle_size', cardinality(p_circle_ids)));
end $$;

create or replace function public.consume_rate_limit(p_actor uuid, p_action text, p_limit int, p_window_seconds int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare window_start bigint := floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds; current_count int;
begin
  insert into public.rate_limits(user_id, action, window_start, count) values (p_actor, p_action, window_start, 1)
    on conflict (user_id, action, window_start) do update set count = rate_limits.count + 1
    returning count into current_count;
  return jsonb_build_object('allowed', current_count <= p_limit,
    'retryAfter', window_start + p_window_seconds - floor(extract(epoch from now()))::int);
end $$;

create or replace function public.search_directory(p_actor uuid, p_q text)
returns table (id uuid, first_name text, last_name text, class_year int, is_demo boolean)
language sql security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.class_year, p.is_demo from public.profiles p
  where p.id <> p_actor and p.onboarded_at is not null and char_length(trim(p_q)) >= 3
    and (p.first_name ilike trim(p_q) || '%' or p.last_name ilike trim(p_q) || '%'
      or (p.first_name || ' ' || p.last_name) ilike trim(p_q) || '%')
    and not exists (select 1 from public.blocks b where
      (b.blocker_id = p_actor and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = p_actor))
  order by p.first_name, p.last_name limit 8;
$$;

create or replace function public.crush_context(p_sender uuid, p_recipient uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'sharedCircleCount', (select count(*) from public.circle_edges a join public.circle_edges b on a.member_id = b.member_id where a.owner_id = p_sender and b.owner_id = p_recipient),
    'senderHasRecipient', exists(select 1 from public.circle_edges where owner_id = p_sender and member_id = p_recipient),
    'recipientHasSender', exists(select 1 from public.circle_edges where owner_id = p_recipient and member_id = p_sender)
  );
$$;

create or replace function public.create_crush(
  p_id uuid, p_sender uuid, p_recipient uuid, p_message_id int, p_hints text[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare blocked boolean; reciprocal uuid; result_status public.crush_status; started timestamptz;
begin
  if p_sender = p_recipient or cardinality(p_hints) <> 14 then raise exception 'Invalid crush'; end if;
  if not exists(select 1 from public.profiles where id = p_sender and onboarded_at is not null)
    or not exists(select 1 from public.profiles where id = p_recipient and onboarded_at is not null) then raise exception 'Onboarding required'; end if;
  started := (date_trunc('week', timezone('America/Detroit', now())) at time zone 'America/Detroit');
  if exists(select 1 from public.crushes where sender_id = p_sender and created_at >= started) then raise exception 'Your one for the week is out there.'; end if;
  select exists(select 1 from public.blocks where (blocker_id = p_sender and blocked_id = p_recipient) or (blocker_id = p_recipient and blocked_id = p_sender)) into blocked;
  if not blocked then select id into reciprocal from public.crushes where sender_id = p_recipient and recipient_id = p_sender and status = 'active' limit 1; end if;
  result_status := case when blocked then 'suppressed'::public.crush_status when reciprocal is not null then 'mutual'::public.crush_status else 'active'::public.crush_status end;
  insert into public.crushes(id, sender_id, recipient_id, message_id, status, expires_at)
    values (p_id, p_sender, p_recipient, p_message_id, result_status, now() + interval '14 days');
  insert into public.crush_hints(crush_id, day_index, hint_text, unlocked_at)
    select p_id, index, p_hints[index], case when index = 1 then now() end from generate_series(1,14) index;
  if reciprocal is not null then
    update public.crushes set status = 'mutual', resolved_at = now() where id in (p_id, reciprocal);
    insert into public.notifications(user_id, kind, payload, dedupe_key)
      values (p_sender, 'mutual_reveal', jsonb_build_object('crush_id', p_id), 'mutual:' || p_id),
             (p_recipient, 'mutual_reveal', jsonb_build_object('crush_id', reciprocal), 'mutual:' || reciprocal);
  elsif result_status = 'active' then
    insert into public.notifications(user_id, kind, payload, dedupe_key)
      values (p_recipient, 'crush_received', jsonb_build_object('crush_id', p_id), 'received:' || p_id);
  end if;
  insert into public.events(user_id, name, props) values (p_sender, 'crush_sent', jsonb_build_object('crush_id', p_id, 'status', result_status));
  return jsonb_build_object('id', p_id, 'status', result_status);
end $$;

create or replace function public.open_crush(p_actor uuid, p_crush uuid)
returns int language plpgsql security definer set search_path = public as $$
declare today date := timezone('America/Detroit', now())::date; latest_day int; latest_time timestamptz; next_day int;
begin
  if not exists(select 1 from public.crushes where id = p_crush and recipient_id = p_actor and status = 'active') then return null; end if;
  insert into public.crush_opens(crush_id, open_date) values (p_crush, today) on conflict do nothing;
  if not found then return null; end if;
  select day_index, unlocked_at into latest_day, latest_time from public.crush_hints where crush_id = p_crush and unlocked_at is not null order by day_index desc limit 1;
  if timezone('America/Detroit', latest_time)::date = today then return latest_day; end if;
  if latest_day >= 14 then return null; end if;
  next_day := latest_day + 1;
  update public.crush_hints set unlocked_at = now() where crush_id = p_crush and day_index = next_day;
  insert into public.notifications(user_id, kind, payload, dedupe_key)
    select sender_id, 'fuse_progress', jsonb_build_object('crush_id', p_crush, 'hint_number', next_day), 'fuse:' || p_crush || ':' || next_day
    from public.crushes where id = p_crush on conflict (dedupe_key) do nothing;
  insert into public.events(user_id, name, props) values (p_actor, 'hint_unlocked', jsonb_build_object('crush_id', p_crush, 'hint_number', next_day));
  return next_day;
end $$;

create or replace function public.submit_guess(p_actor uuid, p_crush uuid, p_guessed uuid)
returns text language plpgsql security definer set search_path = public as $$
declare sender uuid; correct boolean; today date := timezone('America/Detroit', now())::date;
begin
  select sender_id into sender from public.crushes where id = p_crush and recipient_id = p_actor and status = 'active';
  if sender is null or not exists(select 1 from public.profiles where id = p_guessed and onboarded_at is not null) then return 'recorded'; end if;
  if exists(select 1 from public.guesses where crush_id = p_crush and guess_date = today) then return 'recorded'; end if;
  correct := sender = p_guessed;
  insert into public.guesses(crush_id, guessed_id, guess_date, is_correct) values (p_crush, p_guessed, today, correct);
  if correct then
    update public.crushes set correct_guess_at = coalesce(correct_guess_at, now()) where id = p_crush;
    insert into public.notifications(user_id, kind, payload, dedupe_key)
      values (sender, 'consent_prompt', jsonb_build_object('crush_id', p_crush), 'consent:' || p_crush) on conflict (dedupe_key) do nothing;
  end if;
  insert into public.notifications(user_id, kind, payload, dedupe_key)
    values (sender, 'guess_made', jsonb_build_object('crush_id', p_crush, 'is_correct', correct), 'guess:' || p_crush || ':' || today) on conflict (dedupe_key) do nothing;
  insert into public.events(user_id, name, props) values (p_actor, 'guess_submitted', jsonb_build_object('crush_id', p_crush));
  return 'recorded';
end $$;

create or replace function public.consent_reveal(p_actor uuid, p_crush uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare recipient uuid;
begin
  if p_decision not in ('revealed','kept_hidden') then raise exception 'Invalid decision'; end if;
  select recipient_id into recipient from public.crushes where id = p_crush and sender_id = p_actor and status = 'active' and correct_guess_at is not null;
  if recipient is null then raise exception 'Reveal unavailable'; end if;
  if p_decision = 'revealed' then
    update public.crushes set status = 'revealed', consent_decision = 'revealed', resolved_at = now() where id = p_crush;
    insert into public.notifications(user_id, kind, payload, dedupe_key)
      values (recipient, 'identity_revealed', jsonb_build_object('crush_id', p_crush), 'reveal:' || p_crush);
  else update public.crushes set consent_decision = 'kept_hidden' where id = p_crush; end if;
end $$;

create or replace function public.answer_poll_card(p_actor uuid, p_card uuid, p_picked uuid)
returns void language plpgsql security definer set search_path = public as $$
declare card public.poll_cards; prompt int;
begin
  select c.* into card from public.poll_cards c join public.poll_rounds r on r.id = c.round_id
    where c.id = p_card and r.user_id = p_actor for update;
  if card.id is null or card.answered_at is not null then return; end if;
  if p_picked is not null and not (p_picked = any(card.option_ids)) then raise exception 'Invalid option'; end if;
  update public.poll_cards set picked_id = p_picked, skipped = p_picked is null, answered_at = now() where id = p_card;
  if p_picked is not null then
    insert into public.picks(picker_id, picked_id, prompt_id) values (p_actor, p_picked, card.prompt_id);
    insert into public.notifications(user_id, kind, payload, deliver_after)
      values (p_picked, 'poll_pick', jsonb_build_object('prompt_id', card.prompt_id), now() + make_interval(mins => 30 + floor(random() * 61)::int));
  end if;
end $$;

create or replace function public.get_or_create_round(p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare today date := timezone('America/Detroit', now())::date; people uuid[]; prompts int[]; round_id uuid; position int; card_options uuid[]; current_card record; options jsonb;
begin
  select array_agg(member_id order by coalesce((select max(pc.answered_at) from public.poll_cards pc where member_id = any(pc.option_ids)), '-infinity'::timestamptz), md5(p_actor::text || today::text || member_id::text))
    into people from public.circle_edges where owner_id = p_actor
      and not exists(select 1 from public.blocks b where (b.blocker_id = p_actor and b.blocked_id = member_id) or (b.blocker_id = member_id and b.blocked_id = p_actor));
  if coalesce(cardinality(people),0) < 4 then return jsonb_build_object('locked', true, 'circleCount', coalesce(cardinality(people),0)); end if;
  select id into round_id from public.poll_rounds where user_id = p_actor and round_date = today;
  if round_id is null then
    insert into public.poll_rounds(user_id, round_date) values (p_actor, today) returning id into round_id;
    select array_agg(id order by md5(p_actor::text || today::text || id::text)) into prompts from public.poll_prompts where active;
    for position in 0..5 loop
      select array_agg(people[((position * 4 + offset) % cardinality(people)) + 1] order by offset)
        into card_options from generate_series(0,3) offset;
      insert into public.poll_cards(round_id, position, prompt_id, option_ids)
        values (round_id, position, prompts[(position % cardinality(prompts)) + 1], card_options);
    end loop;
  end if;
  select c.id, c.position, c.prompt_id, c.option_ids, pp.text into current_card
    from public.poll_cards c join public.poll_prompts pp on pp.id = c.prompt_id
    where c.round_id = round_id and c.answered_at is null order by c.position limit 1;
  if current_card.id is null then return jsonb_build_object('locked', false, 'complete', true, 'answered', 6, 'total', 6); end if;
  select jsonb_agg(jsonb_build_object('id', p.id, 'firstName', p.first_name, 'lastName', p.last_name, 'classYear', p.class_year) order by array_position(current_card.option_ids, p.id))
    into options from public.profiles p where p.id = any(current_card.option_ids);
  return jsonb_build_object('locked', false, 'complete', false, 'answered', current_card.position, 'total', 6,
    'card', jsonb_build_object('id', current_card.id, 'prompt', current_card.text, 'options', options));
end $$;

create or replace function public.submit_report(p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(p_reason)) not between 1 and 500 then raise exception 'Invalid report'; end if;
  insert into public.reports(reporter_id, reason) values (p_actor, trim(p_reason));
end $$;

create or replace function public.resolve_report(p_report uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reports set resolved_at = coalesce(resolved_at, now()) where id = p_report;
  insert into public.admin_audit_log(action, object_type, object_id) values ('report_resolved','report',p_report);
end $$;

create or replace function public.delete_account(p_actor uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.profiles where id = p_actor and is_demo = false;
$$;

create or replace function public.block_user(p_actor uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_actor = p_target then raise exception 'Invalid block'; end if;
  insert into public.blocks(blocker_id, blocked_id) values (p_actor, p_target) on conflict do nothing;
  delete from public.notifications n where n.payload->>'crush_id' in (
    select c.id::text from public.crushes c where
      (c.sender_id = p_actor and c.recipient_id = p_target)
      or (c.sender_id = p_target and c.recipient_id = p_actor)
  );
  update public.crushes set status = 'suppressed', resolved_at = now()
    where status in ('active','mutual') and ((sender_id = p_actor and recipient_id = p_target) or (sender_id = p_target and recipient_id = p_actor));
end $$;

create or replace function public.block_from_crush(p_actor uuid, p_crush uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select sender_id into target from public.crushes where id = p_crush and recipient_id = p_actor;
  if target is not null then perform public.block_user(p_actor, target); end if;
end $$;

create or replace function public.block_from_pick(p_actor uuid, p_pick uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select picker_id into target from public.picks where id = p_pick and picked_id = p_actor;
  if target is not null then perform public.block_user(p_actor, target); end if;
end $$;

create or replace function public.unblock_user(p_actor uuid, p_target uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.blocks where blocker_id = p_actor and blocked_id = p_target;
$$;

create or replace function public.get_founder_dashboard()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'users', (select count(*) from public.profiles where not is_demo),
      'onboarded', (select count(*) from public.profiles where not is_demo and onboarded_at is not null),
      'crushes', (select count(*) from public.crushes),
      'active_crushes', (select count(*) from public.crushes where status = 'active'),
      'resolved_crushes', (select count(*) from public.crushes where status in ('mutual','revealed')),
      'guesses', (select count(*) from public.guesses),
      'open_reports', (select count(*) from public.reports where resolved_at is null)),
    'retention', jsonb_build_object(
      'active_7d', (select count(*) from public.profiles where not is_demo and last_active_at >= now() - interval '7 days'),
      'active_30d', (select count(*) from public.profiles where not is_demo and last_active_at >= now() - interval '30 days'),
      'round_finishers', (select count(distinct user_id) from public.events where name = 'round_completed')),
    'funnel', jsonb_build_object(
      'signed_up', (select count(*) from public.profiles where not is_demo),
      'onboarded', (select count(*) from public.profiles where not is_demo and onboarded_at is not null),
      'sent_a_crush', (select count(distinct sender_id) from public.crushes),
      'opened_a_crush', (select count(distinct c.recipient_id) from public.crushes c join public.crush_opens o on o.crush_id = c.id),
      'made_a_guess', (select count(distinct c.recipient_id) from public.crushes c join public.guesses g on g.crush_id = c.id)),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reason', reason, 'created_at', created_at, 'resolved_at', resolved_at) order by resolved_at nulls first, created_at desc) from public.reports), '[]'::jsonb)
  );
$$;

create or replace function public.hourly_crush_sweep()
returns void language plpgsql security definer set search_path = public as $$
declare local_hour int := extract(hour from timezone('America/Detroit', now())); local_day date := timezone('America/Detroit', now())::date;
begin
  insert into public.notifications(user_id, kind, payload, dedupe_key)
    select sender_id, 'quiet_close', jsonb_build_object('crush_id', id), 'close:' || id
    from public.crushes where status = 'active' and expires_at <= now()
    on conflict (dedupe_key) do nothing;
  update public.crushes set status = 'expired', resolved_at = now() where status in ('active','suppressed') and expires_at <= now();
  if local_hour between 17 and 20 then
    insert into public.notifications(user_id, kind, payload, dedupe_key)
      select c.recipient_id, 'hint_waiting', jsonb_build_object('crush_id', c.id), 'waiting:' || c.id || ':' || local_day
      from public.crushes c where c.status = 'active'
        and not exists(select 1 from public.crush_opens o where o.crush_id = c.id and o.open_date = local_day)
        and coalesce((select max(o.open_date) from public.crush_opens o where o.crush_id = c.id), timezone('America/Detroit', c.created_at)::date) >= local_day - 4
      on conflict (dedupe_key) do nothing;
  end if;
end $$;

-- The outbox worker claims rows atomically so overlapping cron invocations cannot
-- send the same notification. Claims older than ten minutes are recoverable.
create or replace function public.claim_notification_batch(p_limit int default 25)
returns table (
  id uuid,
  user_id uuid,
  school_email text,
  kind text,
  payload jsonb
) language sql security definer set search_path = public as $$
  with candidates as (
    select n.id
    from public.notifications n
    where n.delivered_at is null
      and n.deliver_after <= now()
      and (n.claimed_at is null or n.claimed_at < now() - interval '10 minutes')
    order by n.deliver_after, n.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), claimed as (
    update public.notifications n
      set claimed_at = now(), attempt_count = n.attempt_count + 1
    from candidates c
    where n.id = c.id
    returning n.id, n.user_id, n.kind, n.payload
  )
  select c.id, c.user_id, p.school_email, c.kind, c.payload
  from claimed c join public.profiles p on p.id = c.user_id;
$$;

create or replace function public.complete_notification(p_id uuid, p_email_sent boolean default false)
returns void language sql security definer set search_path = public as $$
  update public.notifications
  set delivered_at = coalesce(delivered_at, now()),
      email_sent_at = case when p_email_sent then coalesce(email_sent_at, now()) else email_sent_at end,
      claimed_at = null
  where id = p_id;
$$;

create or replace function public.release_notification(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications
  set claimed_at = null,
      deliver_after = now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempt_count, 7))::int))
  where id = p_id and delivered_at is null;
$$;

create or replace function public.save_push_subscription(
  p_actor uuid, p_endpoint text, p_p256dh text, p_auth text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 2048
    or char_length(p_p256dh) not between 1 and 512 or char_length(p_auth) not between 1 and 512 then
    raise exception 'Invalid push subscription';
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
    values (p_actor, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- Only the service role can execute app RPCs. No browser token can call them directly.
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'create_or_find_signup','save_login_code','increment_login_attempt','delete_login_code',
      'create_app_session','delete_app_session','session_profile','complete_onboarding','consume_rate_limit',
      'search_directory','crush_context','create_crush','open_crush','submit_guess','consent_reveal',
      'answer_poll_card','get_or_create_round','submit_report','resolve_report','delete_account',
      'block_user','block_from_crush','block_from_pick','unblock_user','get_founder_dashboard','hourly_crush_sweep',
      'claim_notification_batch','complete_notification','release_notification'
      ,'save_push_subscription'
    ) loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;

select cron.schedule('fourteen-hourly-sweep', '7 * * * *', $$select public.hourly_crush_sweep()$$);

-- Configure these settings after deploying the Edge Function. Until then the job records an error without losing data.
select cron.schedule('fourteen-notification-outbox', '* * * * *', $$
  select net.http_post(
    url := current_setting('app.settings.notification_edge_url', true),
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.notification_edge_secret', true), 'Content-Type', 'application/json'),
    body := '{"source":"pg_cron"}'::jsonb
  ) where nullif(current_setting('app.settings.notification_edge_url', true), '') is not null;
$$);
