-- ============================================================================
-- Fourteen — core schema
--
-- SECURITY MODEL, in one paragraph:
--   Clients get SELECT on a handful of VIEWS and EXECUTE on a handful of
--   SECURITY DEFINER functions. They get nothing on base tables. Every view
--   that a recipient can read is physically incapable of carrying a sender's
--   or picker's identity — anonymity is a property of the grant graph, not of
--   UI discipline. If you add a view, re-read this paragraph first.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- types ----
create type public.account_kind  as enum ('campus', 'personal');
create type public.crush_status  as enum ('active','suppressed','mutual','revealed','expired');
create type public.consent_call  as enum ('signed_for','stayed_anonymous');

-- --------------------------------------------------------------- tables ----
create table public.campuses (
  id            text primary key,           -- 'umich'
  name          text not null,
  city          text not null,              -- 'ANN ARBOR'
  state         text not null,
  zip           text not null,
  email_domain  text not null unique,
  active        boolean not null default true
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  kind          public.account_kind not null,
  campus_id     text references public.campuses(id),
  first_name    text not null check (char_length(first_name) between 1 and 30),
  last_name     text not null check (char_length(last_name)  between 1 and 30),
  grad_year     int check (grad_year between 2026 and 2035),
  is_over_18    boolean not null default false,
  -- The date of birth is NEVER stored. Only this boolean survives the gate.
  onboarded_at  timestamptz,
  joined_month  text not null default to_char(timezone('America/Detroit', now()), 'FMMonth'),
  last_active_date date,
  active_bucket text check (active_bucket in ('night_owl','early_bird')),
  created_at    timestamptz not null default now(),
  constraint campus_has_campus check (
    (kind = 'campus'   and campus_id is not null) or
    (kind = 'personal' and campus_id is null)
  )
);

create table public.circle_edges (
  owner_id  uuid not null references public.profiles(id) on delete cascade,
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
  id     serial primary key,
  text   text not null unique,
  active boolean not null default true
);

create table public.poll_prompts (
  id     serial primary key,
  text   text not null unique,
  active boolean not null default true
);

create table public.crushes (
  id             uuid primary key default gen_random_uuid(),
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  message_id     int  not null references public.crush_messages(id),
  status         public.crush_status not null default 'active',
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  correct_guess_at timestamptz,
  consent_call   public.consent_call,
  resolved_at    timestamptz,
  check (sender_id <> recipient_id)
);
-- One live crush per ordered pair.
create unique index one_live_crush on public.crushes (sender_id, recipient_id)
  where status in ('active','suppressed');
create index crushes_recipient_idx on public.crushes (recipient_id, status);
create index crushes_sender_idx    on public.crushes (sender_id, status);

create table public.crush_hints (
  crush_id    uuid not null references public.crushes(id) on delete cascade,
  day_index   int  not null check (day_index between 1 and 14),
  hint_text   text not null,     -- frozen at send time; can never become false
  kind_label  text not null,     -- shown while locked: "first initial"
  unlocked_at timestamptz,
  primary key (crush_id, day_index)
);

create table public.crush_opens (
  crush_id  uuid not null references public.crushes(id) on delete cascade,
  open_date date not null,
  primary key (crush_id, open_date)
);

create table public.guesses (
  id         uuid primary key default gen_random_uuid(),
  crush_id   uuid not null references public.crushes(id) on delete cascade,
  guessed_id uuid not null references public.profiles(id) on delete cascade,
  guess_date date not null,
  was_correct boolean not null,   -- NEVER exposed to the guesser, by any path
  created_at timestamptz not null default now(),
  unique (crush_id, guess_date)   -- one guess per crush per local day
);

create table public.poll_rounds (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  round_date date not null,
  unique (user_id, round_date)
);

create table public.poll_cards (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.poll_rounds(id) on delete cascade,
  position    int  not null,
  prompt_id   int  not null references public.poll_prompts(id),
  option_ids  uuid[] not null check (array_length(option_ids,1) = 4),
  picked_id   uuid references public.profiles(id) on delete set null,
  skipped     boolean not null default false,
  answered_at timestamptz,
  unique (round_id, position)
);

create table public.picks (
  id         uuid primary key default gen_random_uuid(),
  picker_id  uuid not null references public.profiles(id) on delete cascade,
  picked_id  uuid not null references public.profiles(id) on delete cascade,
  prompt_id  int  not null references public.poll_prompts(id),
  created_at timestamptz not null default now()
);
create index picks_picked_idx on public.picks (picked_id, created_at desc);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  device_token text not null unique,
  environment text not null default 'production' check (environment in ('sandbox','production')),
  created_at timestamptz not null default now()
);

-- Outbox. Nothing is ever delivered directly; a cron drains this.
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          text not null,
  payload       jsonb not null default '{}',
  deliver_after timestamptz not null default now(),
  delivered_at  timestamptz,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notif_pending_idx on public.notifications (deliver_after)
  where delivered_at is null;

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  subject_user_id uuid references public.profiles(id) on delete set null,
  reason_code     text not null check (reason_code in
                    ('harassment','not_18','impersonation','spam','other')),
  detail          text check (char_length(detail) <= 500),  -- admin-only, never rendered to users
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create table public.invite_links (
  code       text primary key check (char_length(code) = 8),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.invite_claims (
  code       text not null references public.invite_links(code) on delete cascade,
  claimed_by uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (code, claimed_by)
);

create table public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  name       text not null,
  props      jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  action       text not null,
  window_start timestamptz not null,
  count        int not null default 1,
  primary key (user_id, action, window_start)
);

-- ------------------------------------------------------------------ RLS ----
-- Deny by default, everywhere, with no exceptions. Clients never touch a base
-- table; the service role (used only by edge functions) bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array[
    'campuses','profiles','circle_edges','blocks','crush_messages','poll_prompts',
    'crushes','crush_hints','crush_opens','guesses','poll_rounds','poll_cards',
    'picks','push_subscriptions','notifications','reports','invite_links',
    'invite_claims','events','rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- views ----

-- Reference content is public-readable; it contains no user data.
create view public.message_library_v as
  select id, text from public.crush_messages where active;
create view public.campus_v as
  select id, name, city, state, zip, email_domain from public.campuses where active;

create view public.me_v as
  select p.id, p.kind, p.campus_id, p.first_name, p.last_name, p.grad_year,
         p.onboarded_at, c.city as campus_city, c.state as campus_state,
         c.zip as campus_zip, c.name as campus_name
  from public.profiles p
  left join public.campuses c on c.id = p.campus_id
  where p.id = auth.uid();

create view public.my_circle_v as
  select p.id, p.first_name, p.last_name, p.grad_year
  from public.circle_edges e
  join public.profiles p on p.id = e.member_id
  where e.owner_id = auth.uid()
  order by p.first_name, p.last_name;

-- Compliments. Note what is absent: picker_id. There is no column here that
-- could leak who chose you, and no join that would reach one.
create view public.compliments_v as
  select pk.id, pr.text as prompt_text, pk.created_at
  from public.picks pk
  join public.poll_prompts pr on pr.id = pk.prompt_id
  where pk.picked_id = auth.uid()
  order by pk.created_at desc
  limit 50;

-- The recipient's inbox. NO sender_id, and suppressed rows are excluded
-- entirely so a blocked sender's crush is indistinguishable from silence.
create view public.crush_inbox_v as
  select c.id,
         m.text  as message_text,
         c.status,
         c.created_at,
         c.expires_at,
         greatest(0, extract(day from c.expires_at - now())::int) as days_remaining,
         (select count(*) from public.crush_hints h
           where h.crush_id = c.id and h.unlocked_at is not null) as clues_unlocked,
         exists (select 1 from public.guesses g
                  where g.crush_id = c.id
                    and g.guess_date = (now() at time zone 'America/Detroit')::date
                ) as guess_used_today
  from public.crushes c
  join public.crush_messages m on m.id = c.message_id
  where c.recipient_id = auth.uid()
    and c.status <> 'suppressed';

-- Clues for a crush the caller received. Locked rows expose only the day and
-- the kind label — never the text.
create view public.crush_clues_v as
  select h.crush_id, h.day_index, h.kind_label,
         case when h.unlocked_at is not null then h.hint_text end as hint_text,
         h.unlocked_at
  from public.crush_hints h
  join public.crushes c on c.id = h.crush_id
  where c.recipient_id = auth.uid() and c.status <> 'suppressed'
  order by h.day_index;

-- The sender's own view. They may see the recipient (they chose them) and
-- their own ladder, including tomorrow's kind label.
create view public.crush_outbox_v as
  select c.id, c.recipient_id,
         p.first_name as recipient_first_name,
         p.last_name  as recipient_last_name,
         m.text as message_text, c.status, c.created_at, c.expires_at,
         greatest(0, extract(day from c.expires_at - now())::int) as days_remaining,
         (c.correct_guess_at is not null and c.consent_call is null
            and c.status = 'active') as awaiting_consent,
         c.consent_call,
         (select count(*) from public.crush_hints h
           where h.crush_id = c.id and h.unlocked_at is not null) as clues_unlocked,
         (select h.kind_label from public.crush_hints h
           where h.crush_id = c.id and h.unlocked_at is null
           order by h.day_index limit 1) as next_clue_label
  from public.crushes c
  join public.profiles p on p.id = c.recipient_id
  join public.crush_messages m on m.id = c.message_id
  where c.sender_id = auth.uid();

-- The ONLY place a recipient can ever learn a sender's identity, and only
-- after mutual or an affirmative consent call.
create view public.reveal_v as
  select c.id, c.status, c.resolved_at,
         s.first_name as sender_first_name,
         r.first_name as recipient_first_name
  from public.crushes c
  join public.profiles s on s.id = c.sender_id
  join public.profiles r on r.id = c.recipient_id
  where c.status in ('mutual','revealed')
    and auth.uid() in (c.sender_id, c.recipient_id);

create view public.my_round_v as
  select cd.id, cd.position, pr.text as prompt_text, cd.answered_at, cd.skipped,
         cd.option_ids
  from public.poll_cards cd
  join public.poll_rounds rd on rd.id = cd.round_id
  join public.poll_prompts pr on pr.id = cd.prompt_id
  where rd.user_id = auth.uid()
    and rd.round_date = (now() at time zone 'America/Detroit')::date
  order by cd.position;

create view public.my_notifications_v as
  select id, kind, payload, created_at, read_at
  from public.notifications
  where user_id = auth.uid() and deliver_after <= now()
  order by created_at desc limit 50;

create view public.my_blocks_v as
  select b.blocked_id as id, p.first_name, p.last_name
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid();

-- Views run with the definer's rights; each one filters on auth.uid() itself.
alter view public.me_v              set (security_invoker = off);
alter view public.my_circle_v       set (security_invoker = off);
alter view public.compliments_v     set (security_invoker = off);
alter view public.crush_inbox_v     set (security_invoker = off);
alter view public.crush_clues_v     set (security_invoker = off);
alter view public.crush_outbox_v    set (security_invoker = off);
alter view public.reveal_v          set (security_invoker = off);
alter view public.my_round_v        set (security_invoker = off);
alter view public.my_notifications_v set (security_invoker = off);
alter view public.my_blocks_v       set (security_invoker = off);
alter view public.message_library_v set (security_invoker = off);
alter view public.campus_v          set (security_invoker = off);

grant select on
  public.me_v, public.my_circle_v, public.compliments_v, public.crush_inbox_v,
  public.crush_clues_v, public.crush_outbox_v, public.reveal_v,
  public.my_round_v, public.my_notifications_v, public.my_blocks_v,
  public.message_library_v, public.campus_v
to authenticated;

grant select on public.campus_v to anon;   -- needed at the signup screen
