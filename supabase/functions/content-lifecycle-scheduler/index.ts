/**
 * content-lifecycle-scheduler — Supabase Edge Function
 *
 * Executes the atomic, idempotent `sync_content_lifecycle` RPC in PostgreSQL to:
 *   - Promote due SCHEDULED episodes and announcements to PUBLISHED
 *   - Record publishing failure reasons on invalid/blocked releases (FAILED)
 *   - Transition PUBLISHED content to EXPIRED only when configured expires_at <= now()
 *   - Close overdue broadcast schedules and promote completed aired episodes
 *
 * Deployment:
 *   supabase functions deploy content-lifecycle-scheduler
 *
 * Invocation:
 *   POST https://<project>.supabase.co/functions/v1/content-lifecycle-scheduler
 *   Authorization: Bearer <service-role-or-cron-secret>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: Bearer token required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const cronSecret = Deno.env.get('LIFECYCLE_CRON_SECRET');
  const token = authHeader.slice('Bearer '.length).trim();

  // Accept service role key, optional configured cron secret, or verify authenticated caller
  const isPrivilegedToken =
    token === serviceKey || (cronSecret != null && cronSecret.length > 0 && token === cronSecret);

  const supabase = createClient(supabaseUrl, serviceKey);

  if (!isPrivilegedToken) {
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: invalid token' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (!profile?.active || !['ADMIN', 'PRODUCER'].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: ADMIN or PRODUCER role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  const { data, error } = await supabase.rpc('sync_content_lifecycle');

  if (error) {
    console.error('[content-lifecycle-scheduler] RPC failed:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, result: data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

