-- Fourteen production data foundation.
-- The manual Next.js adapter uses local SQLite; this migration is the hosted source of truth.
-- DECISION: phone data lives in a separate, service-role-only table instead of profiles.

create extension if not exists pgcrypto;

create type public.crush_status as enum ('active','suppressed','mutual','revealed','expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_number bigint generated always as identity unique,
  first_name text check (char_length(first_name) between 1 and 30),
  last_name text check (char_length(last_name) between 1 and 30),
  class_year int check (class_year between 2027 and 2031),
  is_over_18 boolean not null default false,
  school text not null default 'umich' check (school = 'umich'),
  onboarded_at timestamptz,
  last_active_date date,
  active_hour_bucket text check (active_hour_bucket in ('night_owl','early_bird')),
  joined_month text not null default to_char(timezone('America/Detroit', now()), 'FMMonth'),
  created_at timestamptz not null default now()
);

create table public.profile_private_contact (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+1[0-9]{10}$'),
  manual_sms_consent_at timestamptz not null,
  sms_opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  primary key (blocker_id, blocked_id)
);

create table public.poll_prompts (
  id serial primary key,
  text text not null,
  active boolean not null default true
);

create table public.poll_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_date date not null,
  unique (user_id, round_date)
);

create table public.poll_cards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.poll_rounds(id) on delete cascade,
  prompt_id int not null references public.poll_prompts(id),
  option_ids uuid[] not null check (array_length(option_ids, 1) = 4),
  picked_id uuid references public.profiles(id),
  skipped boolean not null default false,
  answered_at timestamptz
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  picker_id uuid not null references public.profiles(id) on delete cascade,
  picked_id uuid not null references public.profiles(id) on delete cascade,
  prompt_id int not null references public.poll_prompts(id),
  created_at timestamptz not null default now()
);

create table public.crush_messages (
  id serial primary key,
  text text not null,
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

create unique index one_live_crush on public.crushes (sender_id, recipient_id)
  where status in ('active','suppressed');

create table public.crush_hints (
  crush_id uuid not null references public.crushes(id) on delete cascade,
  day_index int not null check (day_index between 1 and 14),
  hint_text text not null,
  unlocked_at timestamptz,
  primary key (crush_id, day_index)
);

create table public.guesses (
  id uuid primary key default gen_random_uuid(),
  crush_id uuid not null references public.crushes(id) on delete cascade,
  guessed_id uuid not null references public.profiles(id),
  guess_date date not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (crush_id, guess_date)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  deliver_after timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_user_id uuid references public.profiles(id),
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.invite_links (
  code text primary key check (char_length(code) = 8),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.invite_claims (
  code text not null references public.invite_links(code),
  claimed_by uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (code, claimed_by)
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
  window_start timestamptz not null,
  count int not null default 1,
  primary key (user_id, action, window_start)
);

create table public.contact_jobs (
  id uuid primary key default gen_random_uuid(),
  crush_id uuid unique not null references public.crushes(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual','ai_phone')),
  status text not null default 'queued' check (status in ('queued','contacted','paused','failed')),
  message text not null,
  deep_link text not null,
  provider_reference text,
  created_at timestamptz not null default now(),
  contacted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid,
  action text not null,
  object_type text not null,
  object_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- RLS is deny-by-default. The service role is used only by server-rendered founder operations.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','profile_private_contact','circle_edges','blocks','poll_prompts','poll_rounds',
    'poll_cards','picks','crush_messages','crushes','crush_hints','guesses','push_subscriptions',
    'notifications','reports','invite_links','invite_claims','events','rate_limits','contact_jobs','admin_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end $$;

create view public.my_circle_v as
  select p.id, p.first_name, p.last_name, p.class_year
  from public.circle_edges e join public.profiles p on p.id = e.member_id
  where e.owner_id = auth.uid();

create view public.compliments_v as
  select pp.text as prompt_text, p.created_at
  from public.picks p join public.poll_prompts pp on pp.id = p.prompt_id
  where p.picked_id = auth.uid();

create view public.crush_inbox_v as
  select c.id, cm.text as message_text, c.created_at, c.expires_at, c.status,
    coalesce(jsonb_agg(jsonb_build_object('day_index', h.day_index, 'hint_text', h.hint_text, 'unlocked_at', h.unlocked_at)
      order by h.day_index) filter (where h.unlocked_at is not null), '[]'::jsonb) as unlocked_hints
  from public.crushes c
  join public.crush_messages cm on cm.id = c.message_id
  left join public.crush_hints h on h.crush_id = c.id
  where c.recipient_id = auth.uid() and c.status <> 'suppressed'
  group by c.id, cm.text;

create view public.crush_outbox_v as
  select c.id, c.recipient_id, p.first_name as recipient_first_name, p.last_name as recipient_last_name,
    cm.text as message_text, c.status, c.created_at, c.expires_at, c.correct_guess_at, c.consent_decision
  from public.crushes c
  join public.profiles p on p.id = c.recipient_id
  join public.crush_messages cm on cm.id = c.message_id
  where c.sender_id = auth.uid();

create view public.reveal_v as
  select c.id, sender.first_name as sender_first_name, recipient.first_name as recipient_first_name,
    c.resolved_at
  from public.crushes c
  join public.profiles sender on sender.id = c.sender_id
  join public.profiles recipient on recipient.id = c.recipient_id
  where c.status in ('mutual','revealed') and auth.uid() in (c.sender_id, c.recipient_id);

create view public.my_notifications_v as
  select id, kind, payload, deliver_after, read_at, created_at
  from public.notifications where user_id = auth.uid();

grant select on public.my_circle_v, public.compliments_v, public.crush_inbox_v,
  public.crush_outbox_v, public.reveal_v, public.my_notifications_v to authenticated;

-- No client receives access to contact data, contact jobs, admin audit data, picker_id, or sender_id.
revoke all on public.profile_private_contact, public.contact_jobs, public.admin_audit_log from anon, authenticated;

create or replace function public.search_directory(q text)
returns table (id uuid, first_name text, last_name text, class_year int)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or char_length(trim(q)) < 3 then return; end if;
  return query
    select p.id, p.first_name, p.last_name, p.class_year from public.profiles p
    where p.id <> auth.uid() and p.onboarded_at is not null and p.school = 'umich'
      and (p.first_name ilike trim(q) || '%' or p.last_name ilike trim(q) || '%')
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = auth.uid())
      )
    order by p.first_name, p.last_name limit 8;
end $$;

revoke all on function public.search_directory(text) from public;
grant execute on function public.search_directory(text) to authenticated;
