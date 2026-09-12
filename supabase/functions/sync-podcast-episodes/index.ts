/**
 * sync-podcast-episodes — Supabase Edge Function
 *
 * Fetches the VIT Community Radio Spotify/Anchor RSS feed and upserts all
 * episode metadata into the `podcast_episodes` table.
 *
 * Deployment:
 *   supabase functions deploy sync-podcast-episodes
 *
 * Required environment variables (set in Supabase Dashboard → Settings → Edge Functions):
 *   SUPABASE_URL             — your project URL (automatically injected)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (must be set manually)
 *
 * Invocation:
 *   POST https://<project>.supabase.co/functions/v1/sync-podcast-episodes
 *   Authorization: Bearer <anon-key>   (any authenticated call is fine)
 *
 * Scheduled via pg_cron every 20 minutes (see migration 21).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RSS_URL = 'https://anchor.fm/s/dd6c2248/podcast/rss';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(xml: string, tag: string): string {
  // Match both <tag>…</tag> and CDATA <tag><![CDATA[…]]></tag>
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const plainRe = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const cdataM = xml.match(cdataRe);
  if (cdataM) return cdataM[1].trim();
  const plainM = xml.match(plainRe);
  return plainM ? plainM[1].trim() : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRfc2822Date(dateStr: string): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

interface EpisodeRecord {
  rss_guid: string;
  title: string;
  description: string | null;
  audio_url: string;
  spotify_url: string | null;
  artwork_url: string | null;
  duration: string | null;
  pub_date: string | null;
  episode_number: number | null;
  last_synced_at: string;
}

function parseItems(xml: string): EpisodeRecord[] {
  const now = new Date().toISOString();
  // Split on <item> boundaries
  const itemChunks = xml.split(/<item[\s>]/i).slice(1);
  const episodes: EpisodeRecord[] = [];

  for (const chunk of itemChunks) {
    // Trim at the closing </item>
    const itemXml = chunk.split(/<\/item>/i)[0];

    const rss_guid = extractText(itemXml, 'guid');
    if (!rss_guid) continue;

    const audio_url = extractAttr(itemXml, 'enclosure', 'url');
    if (!audio_url) continue;

    const rawTitle = extractText(itemXml, 'title');
    const title = stripHtml(rawTitle) || 'Untitled Episode';

    const rawDesc =
      extractText(itemXml, 'description') ||
      extractText(itemXml, 'itunes:summary');
    const description = stripHtml(rawDesc) || null;

    // Prefer itunes:image href, fall back to nothing
    const artworkMatch = itemXml.match(/<itunes:image[^>]*href="([^"]*)"/i);
    const artwork_url = artworkMatch ? artworkMatch[1] : null;

    const rawDuration = extractText(itemXml, 'itunes:duration');
    const duration = rawDuration || null;

    const rawPubDate = extractText(itemXml, 'pubDate');
    const pub_date = parseRfc2822Date(rawPubDate);

    const rawLink = extractText(itemXml, 'link');
    const spotify_url = rawLink || null;

    const rawEpNum = extractText(itemXml, 'itunes:episode');
    const episode_number = rawEpNum ? parseInt(rawEpNum, 10) || null : null;

    episodes.push({
      rss_guid,
      title,
      description,
      audio_url,
      spotify_url,
      artwork_url,
      duration,
      pub_date,
      episode_number,
      last_synced_at: now,
    });
  }

  return episodes;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 1. Fetch RSS
  let rssText: string;
  try {
    const res = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'VIT-Community-Radio-Sync/1.0' },
    });
    if (!res.ok) throw new Error(`RSS returned ${res.status}`);
    rssText = await res.text();
  } catch (e) {
    console.error('[sync] RSS fetch failed:', e);
    return new Response(
      JSON.stringify({ error: 'RSS fetch failed', detail: String(e) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2. Parse
  const episodes = parseItems(rssText);
  if (episodes.length === 0) {
    return new Response(
      JSON.stringify({ synced: 0, message: 'No episodes found in feed' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. Upsert in batches of 50 to stay within request limits
  const BATCH = 50;
  let totalUpserted = 0;
  let errors = 0;

  for (let i = 0; i < episodes.length; i += BATCH) {
    const batch = episodes.slice(i, i + BATCH);
    const { error } = await supabase
      .from('podcast_episodes')
      .upsert(batch, { onConflict: 'rss_guid', ignoreDuplicates: false });

    if (error) {
      console.error('[sync] upsert error:', error.message);
      errors++;
    } else {
      totalUpserted += batch.length;
    }
  }

  console.log(`[sync] done: ${totalUpserted} upserted, ${errors} batch errors`);

  return new Response(
    JSON.stringify({
      synced: totalUpserted,
      total_in_feed: episodes.length,
      batch_errors: errors,
      synced_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
});
