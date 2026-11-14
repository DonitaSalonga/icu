-- 2026-11-15: exam platforms typed by the admin, whole-screen sharing, exam-platform page changes.
-- New event types must match packages/core EVENT_TYPES (checked by packages/core/test/sql-parity.test.ts).

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in (
    'exam_tab_hidden',
    'exam_tab_visible',
    'window_blur',
    'window_focus',
    'navigated_off_exam',
    'tab_opened',
    'url_visited',
    'copy',
    'cut',
    'paste',
    'context_menu',
    'fullscreen_enter',
    'fullscreen_exit',
    'exam_page_not_detected',
    'warning_shown',
    'warning_limit_reached',
    'screenshot_failed',
    'extension_uninstalled',
    'queue_overflow',
    'exam_page_changed',
    'screen_share_started',
    'screen_share_stopped'
));

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
