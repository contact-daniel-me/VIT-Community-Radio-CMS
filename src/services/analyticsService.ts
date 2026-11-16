import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type {
  DeviceCategory,
  ListeningStatus,
  UserActivityLogRow,
} from '@/types/database';

export interface LiveRegisteredVisitor {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  current_path: string;
  current_activity: string;
  device_category: DeviceCategory;
  last_seen_at: string;
  started_at: string;
  is_listening: boolean;
  status: 'online' | 'idle';
}

export interface LiveAnonymousVisitor {
  id: string;
  anonymous_session_id: string;
  masked_visitor_id: string;
  current_path: string;
  current_activity: string;
  device_category: DeviceCategory;
  last_seen_at: string;
  started_at: string;
  is_listening: boolean;
  status: 'online' | 'idle';
}

export interface LiveVisitorsResponse {
  registered_users: LiveRegisteredVisitor[];
  anonymous_visitors: LiveAnonymousVisitor[];
  total_active: number;
}

export interface AnalyticsOverviewData {
  website: {
    total_visitors: number;
    unique_visitors: number;
    total_sessions: number;
    page_views: number;
    new_visitors: number;
    returning_visitors: number;
    avg_engagement_seconds: number;
  };
  live: {
    active_registered_users: number;
    active_anonymous_visitors: number;
    total_active_sessions: number;
    active_audio_listeners: number;
  };
  listening: {
    total_audio_plays: number;
    unique_listeners: number;
    total_listening_seconds: number;
    total_listening_hours: number;
    avg_listening_seconds: number;
    completed_listening_sessions: number;
  };
  booking: {
    total_booking_requests: number;
    pending_bookings: number;
    approved_bookings: number;
    rejected_or_cancelled_bookings: number;
    completed_bookings: number;
  };
}

export interface AudioAnalyticsData {
  summary: {
    total_plays: number;
    unique_listeners: number;
    total_listening_seconds: number;
    total_listening_hours: number;
    avg_listening_seconds: number;
    completed_sessions: number;
    current_live_listeners: number;
  };
  hourly_distribution: Array<{
    hour: number;
    plays: number;
    total_seconds: number;
  }>;
  daily_trends: Array<{
    date: string;
    plays: number;
    listeners: number;
    total_seconds: number;
  }>;
  device_breakdown: Array<{
    device_category: string;
    count: number;
    total_seconds: number;
  }>;
  popular_content: Array<{
    audio_source_id: string;
    source_type: string;
    plays: number;
    unique_listeners: number;
    total_seconds: number;
  }>;
}

export interface BookingAnalyticsData {
  funnel: {
    page_views: number;
    form_opened: number;
    submitted: number;
    approved: number;
    completed: number;
    conversion_rate: number;
  };
  statuses: {
    total_requests: number;
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
    completed: number;
  };
  studios: Array<{
    studio_facility: string;
    total_bookings: number;
  }>;
  timeline: Array<{
    date: string;
    requests: number;
    confirmed: number;
  }>;
}

export interface TrafficAudienceData {
  devices: Array<{
    device_category: string;
    sessions: number;
    visitors: number;
  }>;
  sources: Array<{
    source: string;
    sessions: number;
    visitors: number;
  }>;
  top_pages: Array<{
    page_path: string;
    page_views: number;
    unique_visitors: number;
  }>;
  visitor_types: {
    new_visitors: number;
    returning_visitors: number;
  };
}

export interface UserActivityWithProfile extends UserActivityLogRow {
  user: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  } | null;
}

const ANON_SESSION_KEY = 'vit_radio_anon_session_id';

/** Client-side device detection */
export function getDeviceCategory(): DeviceCategory {
  if (typeof window === 'undefined') return 'Desktop';
  const width = window.innerWidth;
  if (width < 768) return 'Mobile';
  if (width < 1024) return 'Tablet';
  return 'Desktop';
}

/** Detect traffic source without tracking raw IP or private data */
export function getTrafficSource(): string {
  if (typeof window === 'undefined') return 'Direct';
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = urlParams.get('utm_source');
    if (utmSource) return `Campaign (${utmSource})`;

    const ref = document.referrer;
    if (!ref) return 'Direct';

    const refUrl = new URL(ref);
    const host = refUrl.hostname.toLowerCase();
    const currentHost = window.location.hostname.toLowerCase();
    if (host === currentHost) return 'Internal';

    if (host.includes('google') || host.includes('bing') || host.includes('duckduckgo') || host.includes('yahoo')) {
      return 'Organic Search';
    }
    if (host.includes('instagram') || host.includes('facebook') || host.includes('twitter') || host.includes('x.com') || host.includes('linkedin') || host.includes('youtube')) {
      return 'Social Media';
    }
    return `Referral (${host})`;
  } catch {
    return 'Direct';
  }
}

/** Get or initialize anonymous persistent session ID */
export function getAnonymousSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  try {
    let id = window.sessionStorage.getItem(ANON_SESSION_KEY);
    if (!id) {
      id = window.localStorage.getItem(ANON_SESSION_KEY);
    }
    if (!id) {
      id = 'anon_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      try {
        window.sessionStorage.setItem(ANON_SESSION_KEY, id);
        window.localStorage.setItem(ANON_SESSION_KEY, id);
      } catch {
        // Safe quota or private mode fallback
      }
    }
    return id;
  } catch {
    return 'anon_fallback_' + Date.now();
  }
}

/** Map route paths to friendly user activity labels */
export function describeCurrentActivity(pathname: string, isListening: boolean): string {
  if (isListening) return 'Listening to VIT Radio';
  if (pathname === '/') return 'Viewing Homepage';
  if (pathname.startsWith('/studio/book') || pathname === '/studio') return 'Browsing Studio Booking';
  if (pathname.startsWith('/bookings')) return 'Viewing My Bookings';
  if (pathname.startsWith('/episodes') || pathname.startsWith('/admin/episodes')) return 'Browsing Episodes';
  if (pathname.startsWith('/schedule')) return 'Viewing Broadcast Schedule';
  if (pathname.startsWith('/leaderboard')) return 'Viewing Leaderboard';
  if (pathname.startsWith('/about')) return 'Viewing About Station';
  if (pathname.startsWith('/dashboard')) return 'In Admin Dashboard';
  if (pathname.startsWith('/admin/analytics')) return 'Viewing Analytics Center';
  if (pathname.startsWith('/qc')) return 'Reviewing Quality Control';
  if (pathname.startsWith('/audio')) return 'Browsing Audio Library';
  if (pathname.startsWith('/users')) return 'Managing Users';
  return 'Browsing Website';
}

export const analyticsService = {
  getAnonymousSessionId,
  getDeviceCategory,
  getTrafficSource,
  describeCurrentActivity,

  /** Record heartbeat for active presence. Fails silently to protect caller. */
  async sendHeartbeat(
    currentPath: string = window.location.pathname,
    isListening: boolean = false,
    customActivity?: string,
  ): Promise<string | null> {
    try {
      const anonId = getAnonymousSessionId();
      const activity = customActivity ?? describeCurrentActivity(currentPath, isListening);
      const device = getDeviceCategory();
      const source = getTrafficSource();

      const { data, error } = await supabase.rpc('record_heartbeat', {
        p_anonymous_session_id: anonId,
        p_current_path: currentPath,
        p_current_activity: activity,
        p_device_category: device,
        p_is_listening: isListening,
        p_traffic_source: source,
        p_metadata: {},
      });

      if (error) {
        console.warn('[Analytics] Heartbeat warning:', error.message);
        return null;
      }
      return data as string;
    } catch {
      return null;
    }
  },

  /** Record discrete user or anonymous activity event */
  async logActivity(
    eventName: string,
    pagePath: string = window.location.pathname,
    activityDescription: string = '',
    metadata: Record<string, unknown> = {},
    idempotencyKey?: string,
  ): Promise<string | null> {
    try {
      const anonId = getAnonymousSessionId();
      const { data, error } = await supabase.rpc('record_user_activity', {
        p_event_name: eventName,
        p_page_path: pagePath,
        p_activity_description: activityDescription,
        p_anonymous_session_id: anonId,
        p_metadata: metadata as any,
        p_idempotency_key: idempotencyKey ?? null,
      });

      if (error) {
        console.warn('[Analytics] Log activity warning:', error.message);
        return null;
      }
      return data as string;
    } catch {
      return null;
    }
  },

  /** Audio listening heartbeat */
  async sendAudioHeartbeat(
    sessionId: string | null,
    audioSourceId: string,
    sourceType: 'live' | 'episode' | 'podcast',
    secondsIncrement: number,
    status: ListeningStatus,
  ): Promise<string | null> {
    try {
      const anonId = getAnonymousSessionId();
      const device = getDeviceCategory();

      const { data, error } = await supabase.rpc('audio_heartbeat', {
        p_session_id: sessionId,
        p_anonymous_session_id: anonId,
        p_audio_source_id: audioSourceId,
        p_source_type: sourceType,
        p_seconds_increment: secondsIncrement,
        p_status: status,
        p_device_category: device,
      });

      if (error) {
        console.warn('[Analytics] Audio heartbeat warning:', error.message);
        return null;
      }
      return data as string;
    } catch {
      return null;
    }
  },

  // ---------------------------------------------------------------------------
  // Admin Analytics Queries
  // ---------------------------------------------------------------------------

  async getOverview(startDate: string, endDate: string): Promise<AnalyticsOverviewData> {
    const data = await unwrap(
      supabase.rpc('get_analytics_overview', {
        p_start_date: startDate,
        p_end_date: endDate,
      }),
    );
    return data as unknown as AnalyticsOverviewData;
  },

  async getLiveVisitors(): Promise<LiveVisitorsResponse> {
    const data = await unwrap(supabase.rpc('get_live_visitors'));
    return data as unknown as LiveVisitorsResponse;
  },

  async getAudioAnalytics(startDate: string, endDate: string): Promise<AudioAnalyticsData> {
    const data = await unwrap(
      supabase.rpc('get_audio_analytics', {
        p_start_date: startDate,
        p_end_date: endDate,
      }),
    );
    return data as unknown as AudioAnalyticsData;
  },

  async getBookingAnalytics(startDate: string, endDate: string): Promise<BookingAnalyticsData> {
    const data = await unwrap(
      supabase.rpc('get_booking_analytics', {
        p_start_date: startDate,
        p_end_date: endDate,
      }),
    );
    return data as unknown as BookingAnalyticsData;
  },

  async getTrafficAudience(startDate: string, endDate: string): Promise<TrafficAudienceData> {
    const data = await unwrap(
      supabase.rpc('get_traffic_audience_analytics', {
        p_start_date: startDate,
        p_end_date: endDate,
      }),
    );
    return data as unknown as TrafficAudienceData;
  },

  async getUserActivityLogs(options: {
    userId?: string;
    eventName?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: UserActivityWithProfile[]; total: number }> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    let query = supabase
      .from('user_activity_logs')
      .select('*, user:profiles!user_activity_logs_user_id_fkey(id, full_name, avatar_url, role)', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options.userId) {
      query = query.eq('user_id', options.userId);
    }
    if (options.eventName && options.eventName !== 'ALL') {
      query = query.eq('event_name', options.eventName);
    }
    if (options.startDate) {
      query = query.gte('created_at', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('created_at', options.endDate);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    let logs = (data ?? []) as unknown as UserActivityWithProfile[];
    if (options.search && options.search.trim()) {
      const q = options.search.toLowerCase().trim();
      logs = logs.filter(
        (item) =>
          item.activity_description.toLowerCase().includes(q) ||
          item.page_path.toLowerCase().includes(q) ||
          item.event_name.toLowerCase().includes(q) ||
          (item.user && item.user.full_name.toLowerCase().includes(q)) ||
          (item.anonymous_session_id && item.anonymous_session_id.toLowerCase().includes(q)),
      );
    }

    return { logs, total: count ?? logs.length };
  },

  async getUserTimeline(userId: string, limit = 100): Promise<UserActivityWithProfile[]> {
    return unwrap(
      supabase
        .from('user_activity_logs')
        .select('*, user:profiles!user_activity_logs_user_id_fkey(id, full_name, avatar_url, role)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
        .returns<UserActivityWithProfile[]>(),
    );
  },
};
