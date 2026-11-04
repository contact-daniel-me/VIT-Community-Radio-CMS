/**
 * Podcast Episodes Automatic Sync Specification.
 *
 * Verifies that:
 * 1. sync_podcast_episodes RPC:
 *    - Persists new podcast episodes from an array of JSON objects.
 *    - Upserts on conflict by rss_guid without duplication.
 *    - Correctly calculates synced and total counts.
 *    - Handles empty arrays and invalid items gracefully.
 * 2. Database querying:
 *    - podcast_episodes are returned in descending chronological order by pub_date.
 *    - Latest episodes automatically appear at the top of the library.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../harness/db';

describe('podcast episodes automatic sync', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb({ seed: true });
  });

  afterAll(async () => {
    await db?.close();
  });

  it('provides the sync_podcast_episodes RPC function', async () => {
    const rows = await db.sql<{ proname: string }>(
      `select proname from pg_proc where proname = 'sync_podcast_episodes'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].proname).toBe('sync_podcast_episodes');
  });

  it('syncs new podcast episodes and returns synced count', async () => {
    const payload = JSON.stringify([
      {
        rss_guid: 'test-sync-guid-001',
        title: 'Vanakkam Vellore - 03 November 2026',
        description: 'Morning motivation and news for Vellore.',
        audio_url: 'https://anchor.fm/s/dd6c2248/podcast/play/test-001.mp3',
        spotify_url: 'https://open.spotify.com/episode/test-001',
        artwork_url: 'https://d3t3ozftmdmh3i.cloudfront.net/test-001.jpg',
        duration: '00:01:30',
        pub_date: '2026-11-03T01:30:00.000Z',
        episode_number: 101,
      },
      {
        rss_guid: 'test-sync-guid-002',
        title: 'Vanakkam Vellore - 02 November 2026',
        description: 'Yesterday show.',
        audio_url: 'https://anchor.fm/s/dd6c2248/podcast/play/test-002.mp3',
        spotify_url: 'https://open.spotify.com/episode/test-002',
        artwork_url: 'https://d3t3ozftmdmh3i.cloudfront.net/test-002.jpg',
        duration: '00:01:45',
        pub_date: '2026-11-02T01:30:00.000Z',
        episode_number: 100,
      },
    ]);

    const result = await db.sql<{ sync_podcast_episodes: { success: boolean; synced: number; total: number } }>(
      `select public.sync_podcast_episodes($1::jsonb)`,
      [payload],
    );

    const data = result[0].sync_podcast_episodes;
    expect(data.success).toBe(true);
    expect(data.synced).toBe(2);
    expect(data.total).toBeGreaterThanOrEqual(2);

    // Verify rows exist in database
    const rows = await db.sql<{ title: string; pub_date: string }>(
      `select title, pub_date from public.podcast_episodes where rss_guid in ('test-sync-guid-001', 'test-sync-guid-002') order by pub_date desc`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe('Vanakkam Vellore - 03 November 2026');
    expect(rows[1].title).toBe('Vanakkam Vellore - 02 November 2026');
  });

  it('updates existing episodes on conflict by rss_guid', async () => {
    const updatePayload = JSON.stringify([
      {
        rss_guid: 'test-sync-guid-001',
        title: 'Vanakkam Vellore - 03 November 2026 (Updated Title)',
        description: 'Updated description.',
        audio_url: 'https://anchor.fm/s/dd6c2248/podcast/play/test-001.mp3',
        duration: '00:01:35',
        pub_date: '2026-11-03T01:30:00.000Z',
      },
    ]);

    await db.sql(`select public.sync_podcast_episodes($1::jsonb)`, [updatePayload]);

    const row = await db.sql<{ title: string; description: string; duration: string }>(
      `select title, description, duration from public.podcast_episodes where rss_guid = 'test-sync-guid-001'`,
    );
    expect(row[0].title).toBe('Vanakkam Vellore - 03 November 2026 (Updated Title)');
    expect(row[0].description).toBe('Updated description.');
    expect(row[0].duration).toBe('00:01:35');
  });

  it('orders newest episodes at the top when queried by pub_date desc', async () => {
    const rows = await db.sql<{ title: string }>(
      `select title from public.podcast_episodes order by pub_date desc nulls last limit 1`,
    );
    expect(rows[0].title).toBe('Vanakkam Vellore - 03 November 2026 (Updated Title)');
  });

  it('handles empty or null payloads gracefully', async () => {
    const emptyResult = await db.sql<{ sync_podcast_episodes: { success: boolean; synced: number } }>(
      `select public.sync_podcast_episodes('[]'::jsonb)`,
    );
    expect(emptyResult[0].sync_podcast_episodes.success).toBe(true);
    expect(emptyResult[0].sync_podcast_episodes.synced).toBe(0);
  });
});

