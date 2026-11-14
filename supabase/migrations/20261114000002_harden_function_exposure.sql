-- Hardening from `supabase db advisors` (lint 0029) on 2026-11-14.
-- Policy helpers move to a schema the Data API does not expose, so they are no longer /rest/v1/rpc
-- endpoints. Policies reference functions by OID, so they keep working after the move.
-- The intended RPC API (create_session, join_session, start_attempt, end_attempt) stays in public.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_session_admin(uuid) set schema private;
alter function public.is_attempt_admin(uuid) set schema private;
alter function public.is_student_in_my_sessions(uuid) set schema private;
alter function public.can_write_attempt(uuid, timestamptz) set schema private;
alter function public.can_heartbeat(uuid) set schema private;

-- current_role_is is called by name from create_session and join_session, so it stays in public.
-- It only reads the caller's own profile, which RLS already allows, so it no longer needs definer rights.
alter function public.current_role_is(text) security invoker;

-- Trigger and internal functions are never called by clients. Supabase grants new functions in
-- public to authenticated by default; remove that.
revoke execute on function
  public.handle_new_user(),
  public.set_received_at(),
  public.generate_session_code()
from authenticated;
