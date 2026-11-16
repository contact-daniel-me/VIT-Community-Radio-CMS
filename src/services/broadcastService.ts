import { supabase } from '@/lib/supabase';
import { unwrap, unwrapMaybe } from '@/lib/query';
import type {
  BroadcastStateRow,
  CurrentBroadcastRow,
  ScheduleDetailsRow,
  SyncContentLifecycleResult,
} from '@/types/database';

export interface BroadcastSnapshot {
  current: CurrentBroadcastRow | null;
  next: ScheduleDetailsRow | null;
}

let lifecycleRpcAvailable: boolean | null = null;
let lastLifecycleSync = 0;
let lastBroadcastSync = 0;
let broadcastSyncPromise: Promise<BroadcastStateRow> | null = null;
const SYNC_THROTTLE_MS = 20_000;

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
   * CMS never claims something is on air hours after it finished.
   * Throttled to prevent multiple components from executing parallel duplicate RPCs.
   */
  async syncBroadcastState(): Promise<BroadcastStateRow> {
    const now = Date.now();
    if (broadcastSyncPromise) {
      return broadcastSyncPromise;
    }
    if (now - lastBroadcastSync < SYNC_THROTTLE_MS) {
      // Re-use current broadcast state if synced recently
      return unwrap(supabase.rpc('sync_broadcast_state', {}));
    }

    broadcastSyncPromise = (async () => {
      try {
        const res = await unwrap(supabase.rpc('sync_broadcast_state', {}));
        lastBroadcastSync = Date.now();
        return res;
      } finally {
        broadcastSyncPromise = null;
      }
    })();

    return broadcastSyncPromise;
  },

  /**
   * Synchronizes content publishing states (due SCHEDULED -> PUBLISHED / FAILED,
   * expired PUBLISHED -> EXPIRED, and completed broadcast schedules -> PUBLISHED).
   * Features a circuit breaker: if the backend database does not expose this function (404/PGRST202),
   * calls are silenced and bypassed to avoid continuous 404 network cascades.
   */
  async syncContentLifecycle(): Promise<SyncContentLifecycleResult | null> {
    if (lifecycleRpcAvailable === false) {
      return null;
    }

    const now = Date.now();
    if (now - lastLifecycleSync < SYNC_THROTTLE_MS) {
      return null;
    }

    try {
      const { data, error } = await supabase.rpc('sync_content_lifecycle', {});
      if (error) {
        if (error.code === 'PGRST202' || /not found/i.test(error.message)) {
          lifecycleRpcAvailable = false;
          if (import.meta.env.DEV) {
            console.info('[broadcastService] sync_content_lifecycle RPC not present on remote database. Circuit breaker engaged.');
          }
        }
        return null;
      }
      lifecycleRpcAvailable = true;
      lastLifecycleSync = Date.now();
      return data as SyncContentLifecycleResult;
    } catch {
      return null;
    }
  },
};
