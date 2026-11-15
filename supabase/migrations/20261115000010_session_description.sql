-- 2026-11-15: "About this exam", an optional short description the admin writes when creating a
-- session. Shown to the admin in session detail and to the student before Start.

alter table public.exam_sessions
  add column description text check (char_length(description) <= 500);

-- New optional parameter: drop the old signature so PostgREST doesn't see two overloads.
drop function public.create_session(text, text[], timestamptz, timestamptz, int, int, int);

create function public.create_session(
  p_name text,
  p_url_patterns text[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_warning_limit int default 3,
  p_threshold_medium int default 10,
  p_threshold_high int default 25,
  p_description text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
  v_code text;
  v_pattern text;
begin
  if not public.current_role_is('admin') then
    raise exception 'ICU_NOT_ADMIN';
  end if;
  if v_name = '' or char_length(v_name) > 120
     or char_length(v_description) > 500
     or p_url_patterns is null or cardinality(p_url_patterns) not between 1 and 10
     or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
     or p_warning_limit is null or p_warning_limit not between 1 and 10
     or p_threshold_medium is null or p_threshold_high is null
     or p_threshold_medium <= 0 or p_threshold_medium >= p_threshold_high then
    raise exception 'ICU_INVALID_INPUT';
  end if;
  foreach v_pattern in array p_url_patterns loop
    -- Same rules as packages/core isValidExamSite: a full glob pattern, a platform keyword
    -- (netacad), a domain (skillsbuild.org) or a domain plus path (docs.google.com/forms).
    if v_pattern is null or not (
         btrim(v_pattern) ~* '^(\*|https?)://[^/]+(/.*)?$'
      or lower(btrim(v_pattern)) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or lower(btrim(v_pattern)) ~ '^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z0-9]+(-[a-z0-9]+)*(/[^[:space:]]*)?$'
    ) then
      raise exception 'ICU_INVALID_INPUT';
    end if;
  end loop;

  for i in 1..5 loop
    v_code := public.generate_session_code();
    begin
      insert into public.exam_sessions
        (admin_id, name, code, url_patterns, starts_at, ends_at, warning_limit, threshold_medium, threshold_high, description)
      values
        (auth.uid(), v_name, v_code, p_url_patterns, p_starts_at, p_ends_at, p_warning_limit, p_threshold_medium, p_threshold_high, v_description)
      returning id into v_id;
      return json_build_object('id', v_id, 'code', v_code);
    exception when unique_violation then
      -- code clash: try another one
    end;
  end loop;
  raise exception 'ICU_CODE_GENERATION_FAILED';
end;
$$;

revoke execute on function public.create_session(text, text[], timestamptz, timestamptz, int, int, int, text) from public, anon;
grant execute on function public.create_session(text, text[], timestamptz, timestamptz, int, int, int, text) to authenticated;

-- join_session: same as migration 006, plus the description for the student.
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

  select s.id, s.name, s.description, s.starts_at, s.ends_at, s.url_patterns, s.warning_limit,
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
      'description', v_session.description,
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
