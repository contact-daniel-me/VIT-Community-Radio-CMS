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

  async getRJMetrics(userId: string): Promise<DashboardMetrics> {
    // 1. QC Done
    const qcDone = await supabase.from('episodes').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('status', 'APPROVED');
    
    // 2. Final Upload (has final audio but not approved)
    const finalUpload = await supabase.from('episodes').select('id', { count: 'exact', head: true }).eq('created_by', userId).not('final_audio_file_id', 'is', null).neq('status', 'APPROVED');
    
    // 3. Audio Upload (has audio but no final audio, not approved)
    const audioUpload = await supabase.from('episodes').select('id', { count: 'exact', head: true }).eq('created_by', userId).not('audio_file_id', 'is', null).is('final_audio_file_id', null).neq('status', 'APPROVED');
    
    // 4. Booked (confirmed/completed studio bookings by this RJ)
    const booked = await supabase.from('studio_bookings').select('id', { count: 'exact', head: true }).eq('rj_id', userId).in('status', ['CONFIRMED', 'COMPLETED']);

    return {
      pipeline: {
        booked: booked.count || 0,
        approved: 0, // Not heavily used for RJ in isolation this way
        audio_upload: audioUpload.count || 0,
        final_upload: finalUpload.count || 0,
        qc_done: qcDone.count || 0,
      },
      todays_slots: 0, // RJs don't manage the global schedule
      pending_qc: 0, // RJs do not review pending QC
    };
  },

  async getExpiringRawAudio(): Promise<ExpiringRawAudio[]> {
    return unwrap(
      supabase.rpc('get_expiring_raw_audio').returns<ExpiringRawAudio[]>()
    );
  }
};
