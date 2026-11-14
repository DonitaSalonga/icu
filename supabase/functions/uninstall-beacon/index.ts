// R15: opened by Chrome after the extension is uninstalled (chrome.runtime.setUninstallURL).
// Best effort only (RESEARCH F12). The opaque single-use token identifies nothing by itself, and the
// response is identical whether or not the token was valid. Deployed with verify_jwt = false.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const MESSAGE = 'The exam monitoring extension was removed. If an exam was in progress, your examiner will see this.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (UUID.test(token)) {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { error } = await db.rpc('record_uninstall', { p_token: token });
    if (error) console.error('record_uninstall failed', error.message);
  }
  return new Response(MESSAGE, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
});
