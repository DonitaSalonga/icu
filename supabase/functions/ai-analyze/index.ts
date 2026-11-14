// R32: AI suggestion for an attempt (decision D8). Called through pg_net by the attempts trigger
// (attempt ended), the admin's Re-analyze RPC, and a 5-minute sweep. One model request per attempt,
// one Choice question, anonymous input built by ../_shared/analysis.ts. Deployed with verify_jwt = false
// and protected by the x-icu-cron-secret header.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { buildRequest, SUGGESTIONS, type Suggestion } from '../_shared/analysis.ts';

const MODEL_URL = 'https://api.typesafe.ai/v1/systemone';
const TIMEOUT_MS = 25_000;

Deno.serve(async (req) => {
  const secret = Deno.env.get('ICU_CRON_SECRET');
  if (!secret || req.headers.get('x-icu-cron-secret') !== secret) return new Response('unauthorized', { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { attempt_id?: string; sweep?: boolean };
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let ids: string[] = [];
  if (body.attempt_id) ids = [body.attempt_id];
  else if (body.sweep) {
    const { data, error } = await db.rpc('ai_sweep_candidates', { p_limit: 10 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    ids = (data as { attempt_id: string }[]).map((r) => r.attempt_id);
  }
  const results = [];
  for (const id of ids) results.push({ attempt_id: id, ...(await analyze(db, id)) });
  console.log(`[ai-analyze] ${results.map((r) => `${r.status}${r.suggestion ? ':' + r.suggestion : ''}`).join(', ') || 'nothing to do'}`);
  return Response.json({ results });
});

type Outcome = { status: 'done' | 'failed'; suggestion?: Suggestion; error?: string };

async function save(db: SupabaseClient, attemptId: string, row: Record<string, unknown>) {
  const { error } = await db.from('ai_analyses').upsert({ attempt_id: attemptId, analyzed_at: new Date().toISOString(), ...row });
  if (error) console.error('[ai-analyze] save failed', error.message);
}

async function fail(db: SupabaseClient, attemptId: string, message: string): Promise<Outcome> {
  await save(db, attemptId, { status: 'failed', error: message.slice(0, 500), suggestion: null, probabilities: null, confidence: null });
  return { status: 'failed', error: message };
}

async function analyze(db: SupabaseClient, attemptId: string): Promise<Outcome> {
  const { data: attempt } = await db
    .from('attempts')
    .select('started_at, ended_at, data_deleted_at, session:exam_sessions(ends_at, warning_limit)')
    .eq('id', attemptId)
    .single();
  const session = attempt?.session as unknown as { ends_at: string; warning_limit: number } | null;
  if (!attempt?.started_at || attempt.data_deleted_at || !session) return fail(db, attemptId, 'Nothing to analyze');

  const [events, heartbeats, screenshots] = await Promise.all([
    db.from('events').select('type, occurred_at, details, screenshot_id').eq('attempt_id', attemptId).order('occurred_at'),
    db.from('heartbeats').select('received_at').eq('attempt_id', attemptId).order('received_at'),
    db.from('screenshots').select('id, visible_host, visible_path').eq('attempt_id', attemptId),
  ]);
  if (events.error || heartbeats.error || screenshots.error) return fail(db, attemptId, 'Could not load monitoring data');

  const endAt = new Date(Math.min(attempt.ended_at ? Date.parse(attempt.ended_at) : Date.now(), Date.parse(session.ends_at))).toISOString();
  const request = buildRequest({
    startedAt: attempt.started_at,
    endAt,
    warningLimit: session.warning_limit,
    events: events.data,
    heartbeats: heartbeats.data.map((h) => h.received_at),
    screenshots: screenshots.data,
  });

  const key = Deno.env.get('TYPESAFE_API_KEY');
  if (!key) return fail(db, attemptId, 'AI analysis is not configured');
  let res: Response;
  try {
    res = await fetch(MODEL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return fail(db, attemptId, `AI service unreachable: ${e instanceof Error ? e.name : 'error'}`);
  }
  if (!res.ok) return fail(db, attemptId, `AI service error (HTTP ${res.status})`);

  const json = (await res.json().catch(() => null)) as {
    model?: string;
    answers?: { verdict?: { choice?: string; confidence?: number; probabilities?: Record<string, number> } };
    usage?: { input_tokens?: number };
  } | null;
  const answer = json?.answers?.verdict;
  if (!answer?.choice || !(SUGGESTIONS as readonly string[]).includes(answer.choice)) return fail(db, attemptId, 'Unexpected AI response');

  await save(db, attemptId, {
    status: 'done',
    suggestion: answer.choice,
    probabilities: answer.probabilities ?? null,
    confidence: typeof answer.confidence === 'number' ? answer.confidence : null,
    model: json?.model ?? null,
    error: null,
    input_tokens: json?.usage?.input_tokens ?? null,
  });
  return { status: 'done', suggestion: answer.choice as Suggestion };
}
