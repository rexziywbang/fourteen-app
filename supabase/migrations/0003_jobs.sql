-- ============================================================================
-- Scheduled work: expiry, re-engagement, retention.
-- Runs as the table owner via pg_cron; never touched by clients.
-- ============================================================================

create extension if not exists pg_cron;

-- ------------------------------------------------------------- expiry ------
-- "Returned to sender." The RECIPIENT is deliberately not notified — quiet
-- expiry is the mercy in the design. Only the sender hears the door close.

create or replace function public.sweep_expiries()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with done as (
    update public.crushes
       set status = 'expired', resolved_at = now()
     where status in ('active','suppressed') and expires_at <= now()
    returning id, sender_id, status
  ),
  notified as (
    insert into public.notifications(user_id, kind, payload)
    select d.sender_id, 'quiet_close', jsonb_build_object('crush_id', d.id)
      from done d
     where d.status = 'active'          -- suppressed crushes stay silent
    returning 1
  )
  select count(*) into n from done;
  return n;
end $$;

-- ------------------------------------------------- daily re-engagement -----
-- One nudge per active crush per evening, and it gives up after four
-- unopened days rather than nagging someone who has decided not to play.

create or replace function public.queue_clue_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    select c.id, c.recipient_id
      from public.crushes c
     where c.status = 'active'
       and not exists (select 1 from public.crush_opens o
                        where o.crush_id = c.id and o.open_date = public.today_local())
       and (select count(*) from public.crush_opens o
             where o.crush_id = c.id
               and o.open_date > public.today_local() - 4) > 0
       and not exists (select 1 from public.notifications nn
                        where nn.user_id = c.recipient_id
                          and nn.kind = 'clue_waiting'
                          and nn.created_at > now() - interval '20 hours')
  ),
  q as (
    insert into public.notifications(user_id, kind, payload, deliver_after)
    select d.recipient_id, 'clue_waiting', jsonb_build_object('crush_id', d.id),
           -- Land between 5 and 9pm local, jittered.
           (public.today_local() + time '17:00'
              + make_interval(mins => floor(random()*240)::int))
             at time zone 'America/Detroit'
      from due d
    returning 1
  )
  select count(*) into n from q;
  return n;
end $$;

-- ---------------------------------------------------------- retention ------
-- Every published version of COPPA 2.0 requires a retention policy, and it is
-- cheap to run from day one. Nothing here touches a live crush.

create or replace function public.enforce_retention()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Resolved crushes and their clue ladders: 90 days.
  delete from public.crushes
   where status in ('expired','revealed','mutual')
     and resolved_at < now() - interval '90 days';

  -- Delivered notifications: 30 days.
  delete from public.notifications
   where delivered_at is not null and delivered_at < now() - interval '30 days';

  -- Undeliverable backlog: 7 days.
  delete from public.notifications
   where delivered_at is null and created_at < now() - interval '7 days';

  -- Product analytics de-identify at 180 days rather than being deleted, so
  -- retention curves survive without the user attached to them.
  update public.events set user_id = null
   where user_id is not null and created_at < now() - interval '180 days';

  -- Poll rounds and cards: 60 days. Picks (the compliment itself) stay,
  -- because they carry no picker identity to leak.
  delete from public.poll_rounds where round_date < current_date - 60;

  delete from public.rate_limits where window_start < now() - interval '2 days';
  delete from public.crush_opens o
   where not exists (select 1 from public.crushes c where c.id = o.crush_id);
end $$;

-- -------------------------------------------------------------- schedule ---
select cron.schedule('fourteen-expiry',    '*/15 * * * *', $$select public.sweep_expiries()$$);
select cron.schedule('fourteen-reminders', '0 21 * * *',   $$select public.queue_clue_reminders()$$);
select cron.schedule('fourteen-retention', '30 4 * * *',   $$select public.enforce_retention()$$);
