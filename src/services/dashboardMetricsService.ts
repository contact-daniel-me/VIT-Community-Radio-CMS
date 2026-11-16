import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';

export interface DashboardMetrics {
  pipeline: {
    booked: number;
    approved: number;
    audio_upload: number;
    final_upload: number;
    qc_done: number;
  };
  todays_slots: number;
  pending_qc: number;
}

export interface ExpiringRawAudio {
  episode_id: string;
  title: string;
  days_remaining: number;
}

interface CachedEntry<T> {
  data: T;
  timestamp: number;
}

let metricsCache: CachedEntry<DashboardMetrics> | null = null;
const rjMetricsCache = new Map<string, CachedEntry<DashboardMetrics>>();
const METRICS_CACHE_TTL_MS = 20_000; // 20s cache

export const dashboardMetricsService = {
  async getMetrics(forceRefresh = false): Promise<DashboardMetrics> {
    const now = Date.now();
    if (!forceRefresh && metricsCache && now - metricsCache.timestamp < METRICS_CACHE_TTL_MS) {
      return metricsCache.data;
    }

    const data = await unwrap(
      supabase.rpc('get_dashboard_metrics').returns<DashboardMetrics>()
    );

    metricsCache = { data, timestamp: now };
    return data;
  },

  async getRJMetrics(userId: string, forceRefresh = false): Promise<DashboardMetrics> {
    const now = Date.now();
    const cached = rjMetricsCache.get(userId);
    if (!forceRefresh && cached && now - cached.timestamp < METRICS_CACHE_TTL_MS) {
      return cached.data;
    }

    // Run independent metric count queries in parallel rather than sequential waterfalls
    const [qcDone, finalUpload, audioUpload, booked] = await Promise.all([
      supabase
        .from('episodes')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .eq('status', 'APPROVED'),
      supabase
        .from('episodes')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .not('final_audio_file_id', 'is', null)
        .neq('status', 'APPROVED'),
      supabase
        .from('episodes')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .not('audio_file_id', 'is', null)
        .is('final_audio_file_id', null)
        .neq('status', 'APPROVED'),
      supabase
        .from('studio_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('rj_id', userId)
        .in('status', ['CONFIRMED', 'COMPLETED']),
    ]);

    const data: DashboardMetrics = {
      pipeline: {
        booked: booked.count || 0,
        approved: 0,
        audio_upload: audioUpload.count || 0,
        final_upload: finalUpload.count || 0,
        qc_done: qcDone.count || 0,
      },
      todays_slots: 0,
      pending_qc: 0,
    };

    rjMetricsCache.set(userId, { data, timestamp: now });
    return data;
  },

  async getExpiringRawAudio(): Promise<ExpiringRawAudio[]> {
    return unwrap(
      supabase.rpc('get_expiring_raw_audio').returns<ExpiringRawAudio[]>()
    );
  }
};
