import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

describe('Analytics Center & Telemetry Engine (Phase 13)', () => {
  let db: TestDb;
  let adminId: string;
  let rjId: string;

  beforeAll(async () => {
    db = await createTestDb({ seed: true });
    adminId = await db.createUser({
      email: 'admin.analytics@vitradio.test',
      fullName: 'Analytics Admin',
      role: 'ADMIN',
    });
    rjId = await db.createUser({
      email: 'rj.analytics@vitradio.test',
      fullName: 'Analytics RJ',
      role: 'RJ',
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  describe('1. Database Tables & Architecture', () => {
    it('creates all analytics tables with appropriate columns', async () => {
      const tables = await db.sql<{ table_name: string }>(
        `select table_name from information_schema.tables
         where table_schema = 'public'
           and table_name in ('visitor_sessions', 'user_activity_logs', 'audio_listening_sessions', 'analytics_events')
         order by table_name`,
      );

      expect(tables.map((t) => t.table_name)).toEqual([
        'analytics_events',
        'audio_listening_sessions',
        'user_activity_logs',
        'visitor_sessions',
      ]);
    });
  });

  describe('2. Heartbeat & Live Visitor Presence', () => {
    it('creates and refreshes an anonymous visitor session via record_heartbeat', async () => {
      const anonId = 'anon_test_' + Date.now();

      // First heartbeat
      const [firstPulse] = await db.asAnon<{ record_heartbeat: string }>(
        `select public.record_heartbeat(
          $1, '/', 'Viewing Homepage', 'Desktop', false, 'Direct', '{}'::jsonb
        )`,
        [anonId],
      );
      expect(firstPulse.record_heartbeat).toBeDefined();

      // Second heartbeat with updated path
      const [secondPulse] = await db.asAnon<{ record_heartbeat: string }>(
        `select public.record_heartbeat(
          $1, '/studio', 'Browsing Studio Booking', 'Desktop', false, 'Direct', '{}'::jsonb
        )`,
        [anonId],
      );
      expect(secondPulse.record_heartbeat).toBe(firstPulse.record_heartbeat);

      // Verify single record was updated, not duplicated
      const [session] = await db.asUser<{
        id: string;
        current_path: string;
        current_activity: string;
        is_active: boolean;
      }>(
        adminId,
        `select id, current_path, current_activity, is_active
         from public.visitor_sessions
         where id = $1`,
        [firstPulse.record_heartbeat],
      );

      expect(session.current_path).toBe('/studio');
      expect(session.current_activity).toBe('Browsing Studio Booking');
      expect(session.is_active).toBe(true);
    });

    it('cleans up stale sessions older than 60 seconds', async () => {
      const staleAnon = 'anon_stale_' + Date.now();

      const [staleSession] = await db.asAnon<{ record_heartbeat: string }>(
        `select public.record_heartbeat($1, '/', 'Viewing Homepage', 'Desktop')`,
        [staleAnon],
      );

      // Artificially age the session
      await db.sql(
        `update public.visitor_sessions
         set last_seen_at = now() - interval '90 seconds'
         where id = $1`,
        [staleSession.record_heartbeat],
      );

      // Run cleanup
      await db.asAnon(`select public.cleanup_stale_analytics_sessions()`);

      // Verify marked inactive
      const [updated] = await db.asUser<{ is_active: boolean }>(
        adminId,
        `select is_active from public.visitor_sessions where id = $1`,
        [staleSession.record_heartbeat],
      );

      expect(updated.is_active).toBe(false);
    });
  });

  describe('3. User Activity Logs & Deduplication', () => {
    it('records activity and enforces idempotency key deduplication', async () => {
      const idempotencyKey = 'idem_' + Date.now();

      const [log1] = await db.asUser<{ record_user_activity: string }>(
        rjId,
        `select public.record_user_activity(
          'BOOKING_FORM_OPEN', '/studio', 'Opened Studio Booking Dialog',
          'anon_rj_123', '{"date":"2026-11-20"}'::jsonb, $1
        )`,
        [idempotencyKey],
      );

      const [log2] = await db.asUser<{ record_user_activity: string }>(
        rjId,
        `select public.record_user_activity(
          'BOOKING_FORM_OPEN', '/studio', 'Opened Studio Booking Dialog',
          'anon_rj_123', '{"date":"2026-11-20"}'::jsonb, $1
        )`,
        [idempotencyKey],
      );

      // Same ID returned due to idempotency
      expect(log1.record_user_activity).toBe(log2.record_user_activity);
    });
  });

  describe('4. Audio Listening Telemetry & Duration Tracking', () => {
    it('records audio sessions and aggregates listening duration incrementally', async () => {
      const anonListener = 'anon_audio_' + Date.now();

      // Start listening session
      const [session] = await db.asAnon<{ audio_heartbeat: string }>(
        `select public.audio_heartbeat(
          null, $1, 'live_radio_90.8', 'live', 0, 'active', 'Desktop'
        )`,
        [anonListener],
      );
      const sessionId = session.audio_heartbeat;
      expect(sessionId).toBeDefined();

      // First 15-second heartbeat
      await db.asAnon(
        `select public.audio_heartbeat($1, $2, 'live_radio_90.8', 'live', 15, 'active', 'Desktop')`,
        [sessionId, anonListener],
      );

      // Second 15-second heartbeat
      await db.asAnon(
        `select public.audio_heartbeat($1, $2, 'live_radio_90.8', 'live', 15, 'active', 'Desktop')`,
        [sessionId, anonListener],
      );

      // Complete session
      await db.asAnon(
        `select public.audio_heartbeat($1, $2, 'live_radio_90.8', 'live', 5, 'completed', 'Desktop')`,
        [sessionId, anonListener],
      );

      // Verify total duration equals exactly 35 seconds (15 + 15 + 5)
      const [record] = await db.asUser<{
        total_listening_seconds: number;
        listening_status: string;
      }>(
        adminId,
        `select total_listening_seconds, listening_status
         from public.audio_listening_sessions
         where id = $1`,
        [sessionId],
      );

      expect(record.total_listening_seconds).toBe(35);
      expect(record.listening_status).toBe('completed');
    });
  });

  describe('5. Row Level Security & RBAC Protection (Phase 10)', () => {
    it('prohibits non-admin users from reading visitor sessions', async () => {
      const rows = await db.asUser(rjId, `select * from public.visitor_sessions`);
      expect(rows.length).toBe(0);
    });

    it('prohibits non-admin users from calling get_analytics_overview RPC', async () => {
      await expectFailure(
        () => db.asUser(
          rjId,
          `select public.get_analytics_overview(now() - interval '1 day', now())`,
        ),
        /Unauthorized: Only administrators can view analytics overview/i,
      );
    });

    it('prohibits anonymous users from calling get_live_visitors RPC', async () => {
      await expectFailure(
        () => db.asAnon(`select public.get_live_visitors()`),
        /permission denied|Unauthorized/i,
      );
    });

    it('allows administrator to execute get_analytics_overview and get_live_visitors', async () => {
      const [overview] = await db.asUser<{ get_analytics_overview: { website: unknown; live: unknown } }>(
        adminId,
        `select public.get_analytics_overview(now() - interval '7 days', now())`,
      );
      expect(overview.get_analytics_overview).toBeDefined();
      expect(overview.get_analytics_overview.website).toBeDefined();
      expect(overview.get_analytics_overview.live).toBeDefined();

      const [live] = await db.asUser<{ get_live_visitors: { registered_users: unknown[]; anonymous_visitors: unknown[] } }>(
        adminId,
        `select public.get_live_visitors()`,
      );
      expect(live.get_live_visitors).toBeDefined();
      expect(Array.isArray(live.get_live_visitors.registered_users)).toBe(true);
      expect(Array.isArray(live.get_live_visitors.anonymous_visitors)).toBe(true);
    });
  });

  describe('6. Parameter Flexibility, Defaults & Resilience', () => {
    it('executes get_analytics_overview with default parameters (zero arguments)', async () => {
      const [res] = await db.asUser<{ get_analytics_overview: { website: unknown; live: { active_audio_listeners: number; active_listeners: number } } }>(
        adminId,
        `select public.get_analytics_overview()`,
      );
      expect(res.get_analytics_overview).toBeDefined();
      expect(res.get_analytics_overview.website).toBeDefined();
      expect(res.get_analytics_overview.live.active_audio_listeners).toBeDefined();
      expect(res.get_analytics_overview.live.active_listeners).toBeDefined();
    });

    it('handles inverted date bounds gracefully by auto-normalizing', async () => {
      // Pass start > end
      const [res] = await db.asUser<{ get_analytics_overview: { website: unknown } }>(
        adminId,
        `select public.get_analytics_overview(now(), now() - interval '7 days')`,
      );
      expect(res.get_analytics_overview).toBeDefined();
      expect(res.get_analytics_overview.website).toBeDefined();
    });

    it('executes get_audio_analytics with default parameters', async () => {
      const [res] = await db.asUser<{ get_audio_analytics: { summary: unknown } }>(
        adminId,
        `select public.get_audio_analytics()`,
      );
      expect(res.get_audio_analytics).toBeDefined();
      expect(res.get_audio_analytics.summary).toBeDefined();
    });

    it('executes get_booking_analytics with default parameters', async () => {
      const [res] = await db.asUser<{ get_booking_analytics: { funnel: unknown } }>(
        adminId,
        `select public.get_booking_analytics()`,
      );
      expect(res.get_booking_analytics).toBeDefined();
      expect(res.get_booking_analytics.funnel).toBeDefined();
    });

    it('executes get_traffic_audience_analytics with default parameters', async () => {
      const [res] = await db.asUser<{ get_traffic_audience_analytics: { devices: unknown } }>(
        adminId,
        `select public.get_traffic_audience_analytics()`,
      );
      expect(res.get_traffic_audience_analytics).toBeDefined();
      expect(res.get_traffic_audience_analytics.devices).toBeDefined();
    });
  });
});
