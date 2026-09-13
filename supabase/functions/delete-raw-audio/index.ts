/**
 * delete-raw-audio - Supabase Edge Function
 *
 * Automatically deletes RAW audio files that have exceeded their 30-day 
 * retention period after QC completion. Final uploaded audio files are 
 * explicitly protected and never deleted by this function.
 *
 * Deployment:
 *   supabase functions deploy delete-raw-audio
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  // Ensure this is triggered securely (e.g. via service role or cron auth)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Use service role to bypass RLS for deletion
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log('[delete-raw-audio] Starting retention cleanup...');

  try {
    // 1. Find episodes eligible for RAW file deletion.
    // - raw_file_delete_at <= now()
    // - has an audio_file_id
    // - status is not rejected or draft (already covered by raw_file_delete_at presence)
    const { data: episodes, error: fetchError } = await supabase
      .from('episodes')
      .select('id, title, audio_file_id, audio_file:audio_files!episodes_audio_file_id_fkey(id, storage_path, deleted_at)')
      .lte('raw_file_delete_at', new Date().toISOString())
      .not('audio_file_id', 'is', null);

    if (fetchError) {
      throw fetchError;
    }

    if (!episodes || episodes.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No eligible files found for deletion.', deleted_count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let deletedCount = 0;
    const errors: string[] = [];

    // 2. Process each eligible episode
    for (const ep of episodes) {
      const audioFile = Array.isArray(ep.audio_file) ? ep.audio_file[0] : ep.audio_file;
      
      if (!audioFile) {
        continue;
      }
      
      // If it's already marked deleted, skip
      if (audioFile.deleted_at) {
        continue;
      }

      console.log(`[delete-raw-audio] Deleting RAW file for episode ${ep.id}: ${audioFile.storage_path}`);

      // 3. Remove file from storage bucket
      const { error: storageError } = await supabase.storage
        .from('audio') // matches AUDIO_BUCKET 
        .remove([audioFile.storage_path]);

      if (storageError && !/not found/i.test(storageError.message)) {
        console.error(`[delete-raw-audio] Storage error for ${ep.id}:`, storageError);
        errors.push(`Failed to delete storage object for ${ep.id}`);
        continue;
      }

      // 4. Mark audio_file record as deleted
      const { error: updateError } = await supabase
        .from('audio_files')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', audioFile.id);

      if (updateError) {
        console.error(`[delete-raw-audio] DB update error for ${ep.id}:`, updateError);
        errors.push(`Failed to update DB for ${ep.id}`);
        continue;
      }

      // 5. Audit log
      await supabase.from('activity_logs').insert({
        action: 'RAW_FILE_DELETED_AUTO',
        entity_type: 'EPISODE',
        entity_id: ep.id,
        metadata: { title: ep.title, storage_path: audioFile.storage_path }
      });

      deletedCount++;
    }

    return new Response(
      JSON.stringify({
        message: 'Cleanup completed.',
        deleted_count: deletedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[delete-raw-audio] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
