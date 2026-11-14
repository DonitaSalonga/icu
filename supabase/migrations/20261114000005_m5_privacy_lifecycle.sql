-- M5: join rate limit, uninstall beacon, 30-day retention and its schedule.
-- Design: docs/SDD.md § Security (code guessing), F7 (uninstall), F8 (retention). Requirements: R6, R15, R24.
-- Secrets are NOT in this file: the retention job reads the project URL and a shared secret from
-- Vault (names ocm_project_url, ocm_cron_secret), which are created out of band with the CLI.

-- ---------------------------------------------------------------------------
-- R6: join rate limit (≤ 10 failed codes per user per 10 minutes)
-- ---------------------------------------------------------------------------

create table public.join_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index join_failures_user_created_idx on public.join_failures (user_id, created_at);
alter table public.join_failures enable row level security; -- no policies: only definer functions touch it

-- An unknown code now returns {"error": "OCM_CODE_NOT_FOUND"} instead of raising, because raising
-- would roll back the recorded failure. Other errors still raise.
create or replace function public.join_session(p_code text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_session record;
  v_attempt record;
begin
  if not public.current_role_is('student') then
    raise exception 'OCM_NOT_STUDENT';
  end if;
  if (select count(*) from public.join_failures
      where user_id = auth.uid() and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'OCM_RATE_LIMITED';
  end if;

  select s.id, s.name, s.starts_at, s.ends_at, s.url_patterns, s.warning_limit,
         p.full_name as admin_name, p.email as admin_email
    into v_session
  from public.exam_sessions s
  join public.profiles p on p.id = s.admin_id
  where s.code = v_code;

  if not found then
    insert into public.join_failures (user_id) values (auth.uid());
    return json_build_object('error', 'OCM_CODE_NOT_FOUND');
  end if;
  if now() >= v_session.ends_at then
    raise exception 'OCM_SESSION_ENDED';
  end if;

  insert into public.attempts (session_id, student_id, status)
  values (v_session.id, auth.uid(), 'joined')
  on conflict (session_id, student_id) do nothing;

  select id, status into v_attempt
  from public.attempts
  where session_id = v_session.id and student_id = auth.uid();

  return json_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'session', json_build_object(
      'id', v_session.id,
      'name', v_session.name,
      'admin_name', v_session.admin_name,
      'admin_email', v_session.admin_email,
      'starts_at', v_session.starts_at,
      'ends_at', v_session.ends_at,
      'url_patterns', v_session.url_patterns,
      'warning_limit', v_session.warning_limit
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- R15: uninstall beacon (called only by the uninstall-beacon Edge Function with the service role)
-- ---------------------------------------------------------------------------

create function public.record_uninstall(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt uuid;
begin
  update public.attempts
     set uninstall_token = null
   where uninstall_token = p_token and status = 'active'
  returning id into v_attempt;
  if v_attempt is not null then
    insert into public.events (id, attempt_id, type, occurred_at, details)
    values (gen_random_uuid(), v_attempt, 'extension_uninstalled', now(), '{}'::jsonb);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- R24: retention candidates (called only by the retention-cleanup Edge Function)
-- ---------------------------------------------------------------------------

-- Attempts whose data is older than p_days after their end (or the session end, if the attempt
-- never reached the server's End) and not yet deleted.
create function public.retention_candidates(p_days int default 30)
returns table (attempt_id uuid, session_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.session_id
  from public.attempts a
  join public.exam_sessions s on s.id = a.session_id
  where a.data_deleted_at is null
    and a.started_at is not null
    and coalesce(a.ended_at, s.ends_at) < now() - make_interval(days => p_days);
$$;

revoke execute on function
  public.record_uninstall(uuid),
  public.retention_candidates(int)
from public, anon, authenticated;

grant execute on function
  public.record_uninstall(uuid),
  public.retention_candidates(int)
to service_role;

-- ---------------------------------------------------------------------------
-- R24: daily schedule — 03:00 Asia/Manila = 19:00 UTC (pg_cron runs in UTC).
-- pg_cron, pg_net and supabase_vault are available on the free plan (verified 2026-11-14, OQ3).
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ocm-retention-cleanup',
  '0 19 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ocm_project_url') || '/functions/v1/retention-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ocm-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ocm_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $job$
);
