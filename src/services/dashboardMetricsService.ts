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

export const dashboardMetricsService = {
  async getMetrics(): Promise<DashboardMetrics> {
    return unwrap(
      supabase.rpc('get_dashboard_metrics').returns<DashboardMetrics>()
    );
  },

  async getExpiringRawAudio(): Promise<ExpiringRawAudio[]> {
    return unwrap(
      supabase.rpc('get_expiring_raw_audio').returns<ExpiringRawAudio[]>()
    );
  }
};
