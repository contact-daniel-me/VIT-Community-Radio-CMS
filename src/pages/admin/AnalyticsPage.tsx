import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import {
  analyticsService,
  type AnalyticsOverviewData,
  type LiveVisitorsResponse,
  type AudioAnalyticsData,
  type BookingAnalyticsData,
  type TrafficAudienceData,
} from '@/services/analyticsService';
import { OverviewTab } from '@/components/admin/analytics/OverviewTab';
import { LiveVisitorsTab } from '@/components/admin/analytics/LiveVisitorsTab';
import { UserActivityTab } from '@/components/admin/analytics/UserActivityTab';
import { AudioAnalyticsTab } from '@/components/admin/analytics/AudioAnalyticsTab';
import { BookingAnalyticsTab } from '@/components/admin/analytics/BookingAnalyticsTab';
import { TrafficAudienceTab } from '@/components/admin/analytics/TrafficAudienceTab';
import { StorageTab } from '@/components/admin/analytics/StorageTab';
import { FeedbackTab } from '@/components/admin/analytics/FeedbackTab';
import { ReportsTab } from '@/components/admin/analytics/ReportsTab';
import { UserTimelineModal } from '@/components/admin/analytics/UserTimelineModal';
import '@/styles/analytics.css';

export type AnalyticsTab =
  | 'overview'
  | 'live'
  | 'activity'
  | 'audio'
  | 'booking'
  | 'traffic'
  | 'storage'
  | 'feedback'
  | 'reports';

export type DateRangePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';

const VALID_TABS: AnalyticsTab[] = [
  'overview',
  'live',
  'activity',
  'audio',
  'booking',
  'traffic',
  'storage',
  'feedback',
  'reports',
];

export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as AnalyticsTab | null;
  const activeTab: AnalyticsTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'overview';

  const handleTabChange = useCallback((newTab: AnalyticsTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newTab === 'overview') {
        next.delete('tab');
      } else {
        next.set('tab', newTab);
      }
      return next;
    });
  }, [setSearchParams]);

  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Timeline modal
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);

  // Data states
  const [overviewData, setOverviewData] = useState<AnalyticsOverviewData | null>(null);
  const [liveData, setLiveData] = useState<LiveVisitorsResponse | null>(null);
  const [audioData, setAudioData] = useState<AudioAnalyticsData | null>(null);
  const [bookingData, setBookingData] = useState<BookingAnalyticsData | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficAudienceData | null>(null);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Calculate actual ISO date bounds based on preset
  const getDateBounds = useCallback(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (preset === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === 'yesterday') {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (preset === '7d') {
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (preset === '30d') {
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (preset === '90d') {
      start.setDate(now.getDate() - 90);
      start.setHours(0, 0, 0, 0);
    } else if (preset === 'custom') {
      const s = customStart ? new Date(`${customStart}T00:00:00`) : new Date(Date.now() - 7 * 86400000);
      const e = customEnd ? new Date(`${customEnd}T23:59:59.999`) : new Date();
      if (s.getTime() <= e.getTime()) {
        start = s;
        end = e;
      } else {
        start = e;
        end = s;
      }
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [preset, customStart, customEnd]);

  // Check whether current active tab already has loaded data
  const hasDataForCurrentTab = useCallback((): boolean => {
    switch (activeTab) {
      case 'overview':
        return overviewData !== null;
      case 'live':
        return liveData !== null;
      case 'audio':
        return audioData !== null;
      case 'booking':
        return bookingData !== null;
      case 'traffic':
        return trafficData !== null;
      case 'reports':
        return overviewData !== null;
      case 'storage':
      case 'feedback':
      case 'activity':
        return true;
      default:
        return false;
    }
  }, [activeTab, overviewData, liveData, audioData, bookingData, trafficData]);

  // Fetch data for the active tab (silent = true keeps existing UI interactive and non-blocking)
  const fetchData = useCallback(
    async (silent = false) => {
      if (activeTab === 'storage' || activeTab === 'feedback' || activeTab === 'activity') {
        setLastUpdated(new Date());
        return;
      }

      const hasData = hasDataForCurrentTab();
      if (silent || hasData) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const { startDate, endDate } = getDateBounds();

        if (activeTab === 'overview') {
          const data = await analyticsService.getOverview(startDate, endDate);
          setOverviewData(data);
        } else if (activeTab === 'live') {
          const live = await analyticsService.getLiveVisitors();
          setLiveData(live);
        } else if (activeTab === 'audio') {
          const audio = await analyticsService.getAudioAnalytics(startDate, endDate);
          setAudioData(audio);
        } else if (activeTab === 'booking') {
          const booking = await analyticsService.getBookingAnalytics(startDate, endDate);
          setBookingData(booking);
        } else if (activeTab === 'traffic') {
          const traffic = await analyticsService.getTrafficAudience(startDate, endDate);
          setTrafficData(traffic);
        } else if (activeTab === 'reports') {
          if (!overviewData) {
            const data = await analyticsService.getOverview(startDate, endDate);
            setOverviewData(data);
          }
        }

        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Analytics load error:', err);
        if (!hasData) {
          setError((err as Error).message || 'Failed to load analytics records');
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeTab, getDateBounds, hasDataForCurrentTab, overviewData]
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Live auto-refresh interval (every 15s when on live or overview)
  useEffect(() => {
    if (activeTab !== 'live' && activeTab !== 'overview') return;

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void fetchData(true);
      }
    }, 15000);

    return () => window.clearInterval(interval);
  }, [activeTab, fetchData]);

  const { startDate, endDate } = getDateBounds();

  return (
    <div className="analytics-container">
      <PageHeader
        title="Analytics Center"
        description="Authoritative real-time metrics for website traffic, audience listening, user activity and studio bookings."
      />

      {error && (
        <div className="analytics-error-banner" role="alert">
          <div className="analytics-error-content">
            <span className="analytics-error-banner-icon" aria-hidden="true">⚠️</span>
            <div className="analytics-error-text">
              <strong>Analytics Engine Notice</strong>
              <p>{error}</p>
            </div>
          </div>
          <button
            type="button"
            className="analytics-banner-retry"
            onClick={() => void fetchData()}
            disabled={loading}
          >
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {/* Global Date & Range Controls */}
      <div className="analytics-header-controls">
        <div className="analytics-date-filters">
          <button
            type="button"
            className={`analytics-date-btn ${preset === 'today' ? 'active' : ''}`}
            onClick={() => setPreset('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={`analytics-date-btn ${preset === 'yesterday' ? 'active' : ''}`}
            onClick={() => setPreset('yesterday')}
          >
            Yesterday
          </button>
          <button
            type="button"
            className={`analytics-date-btn ${preset === '7d' ? 'active' : ''}`}
            onClick={() => setPreset('7d')}
          >
            Last 7 days
          </button>
          <button
            type="button"
            className={`analytics-date-btn ${preset === '30d' ? 'active' : ''}`}
            onClick={() => setPreset('30d')}
          >
            Last 30 days
          </button>
          <button
            type="button"
            className={`analytics-date-btn ${preset === '90d' ? 'active' : ''}`}
            onClick={() => setPreset('90d')}
          >
            Last 90 days
          </button>
          <button
            type="button"
            className={`analytics-date-btn ${preset === 'custom' ? 'active' : ''}`}
            onClick={() => setPreset('custom')}
          >
            Custom
          </button>
        </div>

        {preset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
            />
            <span className="small muted">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
            />
          </div>
        )}

        <div className="analytics-refresh-row" aria-live="polite">
          <span className="analytics-last-updated">
            Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            type="button"
            className={`analytics-refresh-btn ${isRefreshing ? 'is-refreshing' : ''}`}
            onClick={() => void fetchData(true)}
            disabled={isRefreshing}
            title={isRefreshing ? 'Updating metrics in background…' : 'Refresh analytics data'}
            aria-label="Refresh analytics data"
          >
            <svg
              className={`analytics-refresh-icon ${isRefreshing ? 'is-spinning' : ''}`}
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Refresh</span>
            {isRefreshing && <span className="analytics-refresh-dot" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* 9 Sub-Tabs Navigation */}
      <nav className="analytics-tabs" aria-label="Analytics sub-tabs">
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => handleTabChange('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => handleTabChange('live')}
        >
          <span className="live-pulse-dot" style={{ width: '7px', height: '7px' }} />
          Live Visitors
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => handleTabChange('activity')}
        >
          User Activity
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => handleTabChange('audio')}
        >
          Audio Analytics
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'booking' ? 'active' : ''}`}
          onClick={() => handleTabChange('booking')}
        >
          Booking Analytics
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'traffic' ? 'active' : ''}`}
          onClick={() => handleTabChange('traffic')}
        >
          Traffic & Audience
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'storage' ? 'active' : ''}`}
          onClick={() => handleTabChange('storage')}
        >
          Storage
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'feedback' ? 'active' : ''}`}
          onClick={() => handleTabChange('feedback')}
        >
          Feedback
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => handleTabChange('reports')}
        >
          Reports
        </button>
      </nav>

      {/* Tab Panels */}
      {activeTab === 'overview' && (
        <OverviewTab
          data={overviewData}
          loading={loading}
          error={error}
          onRetry={fetchData}
        />
      )}

      {activeTab === 'live' && (
        <LiveVisitorsTab
          data={liveData}
          loading={loading}
          error={error}
          onRefresh={fetchData}
          onSelectUser={(id, name) => setSelectedUser({ id, name })}
        />
      )}

      {activeTab === 'activity' && (
        <UserActivityTab
          onSelectUser={(id, name) => setSelectedUser({ id, name })}
        />
      )}

      {activeTab === 'audio' && (
        <AudioAnalyticsTab
          data={audioData}
          loading={loading}
          error={error}
          onRetry={fetchData}
        />
      )}

      {activeTab === 'booking' && (
        <BookingAnalyticsTab
          data={bookingData}
          loading={loading}
          error={error}
          onRetry={fetchData}
        />
      )}

      {activeTab === 'traffic' && (
        <TrafficAudienceTab
          data={trafficData}
          loading={loading}
          error={error}
          onRetry={fetchData}
        />
      )}

      {activeTab === 'storage' && (
        <StorageTab />
      )}

      {activeTab === 'feedback' && (
        <FeedbackTab />
      )}

      {activeTab === 'reports' && (
        <ReportsTab
          overviewData={overviewData}
          startDate={startDate}
          endDate={endDate}
        />
      )}

      {/* Individual User Activity Timeline Modal */}
      {selectedUser && (
        <UserTimelineModal
          userId={selectedUser.id}
          userName={selectedUser.name}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
