-- Rename to ICU ("I Caught You"): error codes OCM_* → ICU_*, Vault secret names, retention job.
-- Applied migrations are never edited; this re-creates the latest version of every function that raises
-- a coded error, with identical logic and the new prefix. Grants are unchanged (CREATE OR REPLACE keeps them).

-- from 20261114000001_m1_core.sql
create or replace function public.create_session(
  p_name text,
  p_url_patterns text[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_warning_limit int default 3,
  p_threshold_medium int default 10,
  p_threshold_high int default 25
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_code text;
  v_pattern text;
begin
  if not public.current_role_is('admin') then
    raise exception 'ICU_NOT_ADMIN';
  end if;
  if v_name = '' or char_length(v_name) > 120
     or p_url_patterns is null or cardinality(p_url_patterns) not between 1 and 10
     or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
     or p_warning_limit is null or p_warning_limit not between 1 and 10
     or p_threshold_medium is null or p_threshold_high is null
     or p_threshold_medium <= 0 or p_threshold_medium >= p_threshold_high then
    raise exception 'ICU_INVALID_INPUT';
  end if;
  foreach v_pattern in array p_url_patterns loop
    -- Same syntax as packages/core isValidExamPattern.
    if v_pattern is null or btrim(v_pattern) !~* '^(\*|https?)://[^/]+(/.*)?$' then
      raise exception 'ICU_INVALID_INPUT';
    end if;
  end loop;

  for i in 1..5 loop
    v_code := public.generate_session_code();
    begin
      insert into public.exam_sessions
        (admin_id, name, code, url_patterns, starts_at, ends_at, warning_limit, threshold_medium, threshold_high)
      values
        (auth.uid(), v_name, v_code, p_url_patterns, p_starts_at, p_ends_at, p_warning_limit, p_threshold_medium, p_threshold_high)
      returning id into v_id;
      return json_build_object('id', v_id, 'code', v_code);
    exception when unique_violation then
      -- code clash: try another one
    end;
  end loop;
  raise exception 'ICU_CODE_GENERATION_FAILED';
end;
$$;

-- from 20261114000004_m4_review.sql
create or replace function public.delete_attempt_rows(p_attempt_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_events int;
  v_heartbeats int;
  v_screenshots int;
begin
  if not private.is_attempt_admin(p_attempt_id) then
    raise exception 'ICU_NOT_SESSION_ADMIN';
  end if;
  select session_id into v_session from public.attempts where id = p_attempt_id;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'screenshots' and name like v_session::text || '/' || p_attempt_id::text || '/%'
  ) then
    raise exception 'ICU_STORAGE_NOT_EMPTY';
  end if;

  delete from public.events where attempt_id = p_attempt_id;
  get diagnostics v_events = row_count;
  delete from public.heartbeats where attempt_id = p_attempt_id;
  get diagnostics v_heartbeats = row_count;
  delete from public.screenshots where attempt_id = p_attempt_id;
  get diagnostics v_screenshots = row_count;
  update public.attempts set data_deleted_at = now() where id = p_attempt_id;

  return json_build_object('deleted_events', v_events, 'deleted_heartbeats', v_heartbeats, 'deleted_screenshots', v_screenshots);
end;
$$;

-- from 20261114000001_m1_core.sql
create or replace function public.end_attempt(p_attempt_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if p_reason is null or p_reason not in ('student', 'time_window') then
    raise exception 'ICU_INVALID_INPUT';
  end if;

  select a.id, a.status, a.ended_at, s.ends_at
    into v
  from public.attempts a
  join public.exam_sessions s on s.id = a.session_id
  where a.id = p_attempt_id and a.student_id = auth.uid()
  for update of a;

  if not found then
    raise exception 'ICU_NOT_OWNER';
  end if;
  if v.status = 'active' then
    update public.attempts
       set status = 'ended',
           ended_at = least(now(), v.ends_at),
           end_reason = p_reason,
           uninstall_token = null
     where id = p_attempt_id
    returning ended_at into v.ended_at;
  end if;

  return json_build_object('ended_at', v.ended_at);
end;
$$;

-- from 20261114000001_m1_core.sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
begin
  if v_role is null or v_role not in ('student', 'admin') then
    raise exception 'ICU_INVALID_ROLE';
  end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'ICU_INVALID_INPUT';
  end if;
  insert into public.profiles (id, role, full_name, email)
  values (new.id, v_role, v_name, coalesce(new.email, ''));
  return new;
end;
$$;

-- from 20261114000005_m5_privacy_lifecycle.sql
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
    raise exception 'ICU_NOT_STUDENT';
  end if;
  if (select count(*) from public.join_failures
      where user_id = auth.uid() and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'ICU_RATE_LIMITED';
  end if;

  select s.id, s.name, s.starts_at, s.ends_at, s.url_patterns, s.warning_limit,
         p.full_name as admin_name, p.email as admin_email
    into v_session
  from public.exam_sessions s
  join public.profiles p on p.id = s.admin_id
  where s.code = v_code;

  if not found then
    insert into public.join_failures (user_id) values (auth.uid());
    return json_build_object('error', 'ICU_CODE_NOT_FOUND');
  end if;
  if now() >= v_session.ends_at then
    raise exception 'ICU_SESSION_ENDED';
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

-- from 20261114000004_m4_review.sql
create or replace function public.set_verdict(p_attempt_id uuid, p_verdict text, p_note text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not private.is_attempt_admin(p_attempt_id) then
    raise exception 'ICU_NOT_SESSION_ADMIN';
  end if;
  if p_verdict is null or p_verdict not in ('cleared', 'suspicious', 'cheating_confirmed')
     or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'ICU_INVALID_INPUT';
  end if;
  update public.attempts
     set verdict = p_verdict,
         verdict_note = nullif(btrim(coalesce(p_note, '')), ''),
         verdict_by = auth.uid(),
         verdict_at = now()
   where id = p_attempt_id
  returning verdict_at into v_at;
  return json_build_object('verdict_at', v_at);
end;
$$;

-- from 20261114000001_m1_core.sql
create or replace function public.start_attempt(p_attempt_id uuid, p_consent_version text, p_age_confirmed boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  -- Close attempts whose session window has passed but whose end never reached the server (F4).
  update public.attempts a
     set status = 'ended', ended_at = s.ends_at, end_reason = 'time_window', uninstall_token = null
    from public.exam_sessions s
   where s.id = a.session_id and a.student_id = auth.uid() and a.status = 'active' and s.ends_at <= now();

  select a.id, a.status, a.started_at, a.uninstall_token, s.starts_at, s.ends_at
    into v
  from public.attempts a
  join public.exam_sessions s on s.id = a.session_id
  where a.id = p_attempt_id and a.student_id = auth.uid()
  for update of a;

  if not found then
    raise exception 'ICU_NOT_OWNER';
  end if;
  if v.status = 'active' then
    -- Idempotent: a retried Start returns the same attempt.
    return json_build_object('started_at', v.started_at, 'ends_at', v.ends_at, 'uninstall_token', v.uninstall_token, 'server_now', now());
  end if;
  if v.status = 'ended' then
    raise exception 'ICU_ATTEMPT_ENDED';
  end if;
  if not coalesce(p_age_confirmed, false) or coalesce(btrim(p_consent_version), '') = '' then
    raise exception 'ICU_CONSENT_REQUIRED';
  end if;
  if now() < v.starts_at then
    raise exception 'ICU_NOT_OPEN_YET';
  end if;
  if now() >= v.ends_at then
    raise exception 'ICU_SESSION_ENDED';
  end if;
  if exists (
    select 1 from public.attempts
    where student_id = auth.uid() and status = 'active' and id <> p_attempt_id
  ) then
    raise exception 'ICU_ALREADY_ACTIVE';
  end if;

  update public.attempts
     set status = 'active',
         consent_at = now(),
         consent_version = btrim(p_consent_version),
         age_confirmed = true,
         started_at = now(),
         uninstall_token = gen_random_uuid()
   where id = p_attempt_id
  returning started_at, uninstall_token into v.started_at, v.uninstall_token;

  -- server_now lets the extension correct its clock (event times are checked against the attempt window).
  return json_build_object('started_at', v.started_at, 'ends_at', v.ends_at, 'uninstall_token', v.uninstall_token, 'server_now', now());
end;
$$;

-- Vault secret names (values unchanged; created out of band, never in the repo).
-- vault.secrets isn't writable directly; vault.update_secret keeps the value and changes the name.
select vault.update_secret(id, decrypted_secret, 'icu_project_url') from vault.decrypted_secrets where name = 'ocm_project_url';
select vault.update_secret(id, decrypted_secret, 'icu_cron_secret') from vault.decrypted_secrets where name = 'ocm_cron_secret';

-- Retention job under the new name and header (03:00 Asia/Manila = 19:00 UTC).
select cron.unschedule('ocm-retention-cleanup')
where exists (select 1 from cron.job where jobname = 'ocm-retention-cleanup');

select cron.schedule(
  'icu-retention-cleanup',
  '0 19 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'icu_project_url') || '/functions/v1/retention-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-icu-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'icu_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $job$
);
