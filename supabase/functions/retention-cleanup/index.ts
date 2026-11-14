// R24: deletes monitoring data 30 days after an attempt ends (SDD.md § Key flows F8).
// Called daily by pg_cron + pg_net with the x-icu-cron-secret header (secret ICU_CRON_SECRET).
// Idempotent: a failed run is picked up by the next one. Deployed with verify_jwt = false.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const RETENTION_DAYS = 30;

Deno.serve(async (req) => {
  const secret = Deno.env.get('ICU_CRON_SECRET');
  if (!secret || req.headers.get('x-icu-cron-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: candidates, error } = await db.rpc('retention_candidates', { p_days: RETENTION_DAYS });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let attempts = 0;
  let objects = 0;
  const failures: string[] = [];
  for (const { attempt_id, session_id } of candidates as { attempt_id: string; session_id: string }[]) {
    try {
      const prefix = `${session_id}/${attempt_id}`;
      for (;;) {
        const { data: files, error: listError } = await db.storage.from('screenshots').list(prefix, { limit: 100 });
        if (listError) throw listError;
        if (!files.length) break;
        const { error: removeError } = await db.storage.from('screenshots').remove(files.map((f) => `${prefix}/${f.name}`));
        if (removeError) throw removeError;
        objects += files.length;
      }
      for (const table of ['events', 'heartbeats', 'screenshots', 'ai_analyses']) {
        const { error: deleteError } = await db.from(table).delete().eq('attempt_id', attempt_id);
        if (deleteError) throw deleteError;
      }
      const { error: markError } = await db.from('attempts').update({ data_deleted_at: new Date().toISOString() }).eq('id', attempt_id);
      if (markError) throw markError;
      attempts++;
    } catch (e) {
      failures.push(`${attempt_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Join-failure records only matter for the 10-minute rate limit.
  await db.from('join_failures').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());

  console.log(`[retention] attempts=${attempts} objects=${objects} failures=${failures.length}`);
  return Response.json({ attempts, objects, failures });
});
