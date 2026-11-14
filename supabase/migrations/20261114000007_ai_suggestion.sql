-- AI suggestion (R32, decision D8): one analysis-model request per attempt, run automatically when an
-- attempt ends, shown to the admin as a suggestion. Also records which site each screenshot showed.
-- The model API key lives only in the ai-analyze Edge Function secret (TYPESAFE_API_KEY).

-- ---------------------------------------------------------------------------
-- What each screenshot showed (sanitized host + path, same rule as visited URLs; D8 Q32)
-- ---------------------------------------------------------------------------

alter table public.screenshots
  add column visible_host text check (char_length(visible_host) <= 255),
  add column visible_path text check (char_length(visible_path) <= 1024);

-- ---------------------------------------------------------------------------
-- Settings: automatic analysis can be switched off per project (the test project keeps it off so
-- test runs don't spend model credits; the AI integration test turns it on while it runs).
-- ---------------------------------------------------------------------------

create table public.app_settings (
  id boolean primary key default true check (id),
  ai_auto boolean not null default true
);
insert into public.app_settings (id) values (true) on conflict do nothing;
alter table public.app_settings enable row level security; -- no policies: service role only

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------

create table public.ai_analyses (
  attempt_id uuid primary key references public.attempts (id) on delete cascade,
  status text not null check (status in ('pending', 'done', 'failed')),
  suggestion text check (suggestion in ('cheating_ai_or_web', 'cheating_copy_paste', 'cheating_monitoring_off', 'needs_review', 'likely_fine')),
  probabilities jsonb,
  confidence real check (confidence between 0 and 1),
  model text,
  error text check (char_length(error) <= 500),
  input_tokens int,
  requested_at timestamptz not null default now(),
  analyzed_at timestamptz
);
alter table public.ai_analyses enable row level security;

create policy ai_analyses_admin_select on public.ai_analyses
  for select to authenticated
  using (private.is_attempt_admin(attempt_id));

-- ---------------------------------------------------------------------------
-- Calling the Edge Function (async, through pg_net; same Vault secrets as the retention job)
-- ---------------------------------------------------------------------------

create function private.call_ai_analyze(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'icu_project_url') || '/functions/v1/ai-analyze',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-icu-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'icu_cron_secret')
    ),
    body := p_body,
    timeout_milliseconds := 30000
  );
end;
$$;

-- R32: automatic analysis when an attempt ends (the student clicks End, or the time-window end).
create function private.on_attempt_ended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended'
     and new.started_at is not null and new.data_deleted_at is null
     and (select ai_auto from public.app_settings where id) then
    insert into public.ai_analyses (attempt_id, status) values (new.id, 'pending')
    on conflict (attempt_id) do nothing;
    perform private.call_ai_analyze(jsonb_build_object('attempt_id', new.id));
  end if;
  return new;
end;
$$;

create trigger attempts_request_ai_analysis
  after update of status on public.attempts
  for each row execute function private.on_attempt_ended();

-- R32: the admin's "Re-analyze" button. At most one request per attempt every 30 s.
create function public.request_ai_analysis(p_attempt_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_attempt_admin(p_attempt_id) then
    raise exception 'ICU_NOT_SESSION_ADMIN';
  end if;
  if not exists (select 1 from public.attempts where id = p_attempt_id and started_at is not null and data_deleted_at is null) then
    raise exception 'ICU_NOTHING_TO_ANALYZE';
  end if;
  if exists (select 1 from public.ai_analyses where attempt_id = p_attempt_id and status = 'pending' and requested_at > now() - interval '30 seconds') then
    return json_build_object('status', 'pending');
  end if;
  insert into public.ai_analyses (attempt_id, status) values (p_attempt_id, 'pending')
  on conflict (attempt_id) do update set status = 'pending', requested_at = now(), error = null;
  perform private.call_ai_analyze(jsonb_build_object('attempt_id', p_attempt_id));
  return json_build_object('status', 'pending');
end;
$$;

-- Attempts that ended without reaching the server's End (time-window end, browser closed) get swept.
create function public.ai_sweep_candidates(p_limit int default 10)
returns table (attempt_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
  from public.attempts a
  join public.exam_sessions s on s.id = a.session_id
  left join public.ai_analyses x on x.attempt_id = a.id
  where x.attempt_id is null
    and a.started_at is not null
    and a.data_deleted_at is null
    and coalesce(a.ended_at, s.ends_at) < now()
    and coalesce(a.ended_at, s.ends_at) > now() - interval '2 days'
  order by coalesce(a.ended_at, s.ends_at)
  limit p_limit;
$$;

-- R23: early deletion also removes the AI suggestion derived from the deleted data.
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
  delete from public.ai_analyses where attempt_id = p_attempt_id;
  update public.attempts set data_deleted_at = now() where id = p_attempt_id;

  return json_build_object('deleted_events', v_events, 'deleted_heartbeats', v_heartbeats, 'deleted_screenshots', v_screenshots);
end;
$$;

revoke execute on function
  private.call_ai_analyze(jsonb),
  private.on_attempt_ended(),
  public.request_ai_analysis(uuid),
  public.ai_sweep_candidates(int)
from public, anon, authenticated;

grant execute on function public.request_ai_analysis(uuid) to authenticated;
grant execute on function public.ai_sweep_candidates(int) to service_role;

-- Sweep every 5 minutes, only when automatic analysis is on.
select cron.schedule(
  'icu-ai-sweep',
  '*/5 * * * *',
  $job$
  select private.call_ai_analyze('{"sweep": true}'::jsonb)
  where (select ai_auto from public.app_settings where id);
  $job$
);
