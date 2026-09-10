import { supabase } from '@/lib/supabase';
import { unwrap, unwrapMaybe } from '@/lib/query';
import type {
  BroadcastStateRow,
  CurrentBroadcastRow,
  ScheduleDetailsRow,
} from '@/types/database';

export interface BroadcastSnapshot {
  current: CurrentBroadcastRow | null;
  next: ScheduleDetailsRow | null;
}

export const broadcastService = {
  async getCurrentBroadcast(): Promise<CurrentBroadcastRow | null> {
    return unwrapMaybe(supabase.from('v_current_broadcast').select('*').maybeSingle());
  },

  async getNextBroadcast(): Promise<ScheduleDetailsRow | null> {
    return unwrapMaybe(supabase.from('v_next_broadcast').select('*').maybeSingle());
  },

  /** One round trip for the Live screen and the dashboard header. */
  async getSnapshot(): Promise<BroadcastSnapshot> {
    const [current, next] = await Promise.all([
      this.getCurrentBroadcast(),
      this.getNextBroadcast(),
    ]);
    return { current, next };
  },

  async startBroadcast(scheduleId: string): Promise<BroadcastStateRow> {
    return unwrap(supabase.rpc('start_broadcast', { p_schedule_id: scheduleId }));
  },

  async endBroadcast(): Promise<BroadcastStateRow> {
    return unwrap(supabase.rpc('end_broadcast', {}));
  },

  /**
   * Closes slots whose end time has passed. Called when a dashboard loads so the
   * CMS never claims something is on air hours after it finished. This is not a
   * playout automation engine -- nothing here touches an encoder.
   */
  async syncBroadcastState(): Promise<BroadcastStateRow> {
    return unwrap(supabase.rpc('sync_broadcast_state', {}));
  },
};
