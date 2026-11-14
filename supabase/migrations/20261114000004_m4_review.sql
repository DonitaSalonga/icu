-- M4 admin review: per-attempt summaries, verdicts, early deletion.
-- Design: docs/SDD.md § Database RPCs, § Key flows F6. Requirements: R18, R19, R22, R23.

-- R19: one row per started-or-joined attempt in a session, with event counts and monitoring-gap count.
-- Gap rule must match packages/core findGaps (QAD T22): server heartbeat times within
-- [started_at, min(ended_at ?? now, session.ends_at)], plus both ends; a hole > 60 s is a gap.
-- Security invoker: RLS limits rows to the caller's own sessions.
create function public.session_attempt_summaries(p_session_id uuid)
returns table (
  attempt_id uuid,
  student_id uuid,
  full_name text,
  email text,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  verdict text,
  verdict_at timestamptz,
  data_deleted_at timestamptz,
  event_counts jsonb,
  gap_count int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with att as (
    select a.*, least(coalesce(a.ended_at, now()), s.ends_at) as end_at
    from public.attempts a
    join public.exam_sessions s on s.id = a.session_id
    where a.session_id = p_session_id
  ),
  points as (
    select att.id, h.received_at as t
    from att join public.heartbeats h on h.attempt_id = att.id
    where att.started_at is not null and h.received_at between att.started_at and att.end_at
    union all
    select id, started_at from att where started_at is not null and end_at > started_at
    union all
    select id, end_at from att where started_at is not null and end_at > started_at
  ),
  holes as (
    select id, t - lag(t) over (partition by id order by t) as hole from points
  ),
  gaps as (
    select id, count(*) filter (where hole > interval '60 seconds')::int as gap_count from holes group by id
  ),
  counts as (
    select attempt_id, jsonb_object_agg(type, n) as event_counts
    from (select e.attempt_id, e.type, count(*)::int as n from public.events e join att on att.id = e.attempt_id group by 1, 2) c
    group by attempt_id
  )
  select att.id, att.student_id, p.full_name, p.email, att.status, att.started_at, att.ended_at,
         att.verdict, att.verdict_at, att.data_deleted_at,
         coalesce(counts.event_counts, '{}'::jsonb), coalesce(gaps.gap_count, 0)
  from att
  join public.profiles p on p.id = att.student_id
  left join counts on counts.attempt_id = att.id
  left join gaps on gaps.id = att.id
  order by att.created_at;
$$;

-- R22
create function public.set_verdict(p_attempt_id uuid, p_verdict text, p_note text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not private.is_attempt_admin(p_attempt_id) then
    raise exception 'OCM_NOT_SESSION_ADMIN';
  end if;
  if p_verdict is null or p_verdict not in ('cleared', 'suspicious', 'cheating_confirmed')
     or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'OCM_INVALID_INPUT';
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

-- R23: deletes monitoring rows after the dashboard removed the attempt's Storage objects (SDD F6 step 5).
create function public.delete_attempt_rows(p_attempt_id uuid)
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
    raise exception 'OCM_NOT_SESSION_ADMIN';
  end if;
  select session_id into v_session from public.attempts where id = p_attempt_id;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'screenshots' and name like v_session::text || '/' || p_attempt_id::text || '/%'
  ) then
    raise exception 'OCM_STORAGE_NOT_EMPTY';
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

revoke execute on function
  public.session_attempt_summaries(uuid),
  public.set_verdict(uuid, text, text),
  public.delete_attempt_rows(uuid)
from public, anon;

grant execute on function
  public.session_attempt_summaries(uuid),
  public.set_verdict(uuid, text, text),
  public.delete_attempt_rows(uuid)
to authenticated;
