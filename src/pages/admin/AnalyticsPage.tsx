import { useEffect, useState, useCallback } from 'react';
import { PageHeader, Banner } from '@/components/ui';
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
  | 'reports';

export type DateRangePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  // Timeline modal
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);

  // Data states
  const [overviewData, setOverviewData] = useState<AnalyticsOverviewData | null>(null);
  const [liveData, setLiveData] = useState<LiveVisitorsResponse | null>(null);
  const [audioData, setAudioData] = useState<AudioAnalyticsData | null>(null);
  const [bookingData, setBookingData] = useState<BookingAnalyticsData | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficAudienceData | null>(null);

  const [loading, setLoading] = useState(true);
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
    } else if (preset === 'custom' && customStart && customEnd) {
      start = new Date(`${customStart}T00:00:00`);
      end = new Date(`${customEnd}T23:59:59`);
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [preset, customStart, customEnd]);

  // Fetch data for the active tab
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
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

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Analytics load error:', err);
      setError((err as Error).message || 'Failed to load analytics records');
    } finally {
      setLoading(false);
    }
  }, [activeTab, getDateBounds, overviewData]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Live auto-refresh interval (every 15s when on live or overview)
  useEffect(() => {
    if (activeTab !== 'live' && activeTab !== 'overview') return;

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void fetchData();
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
        <Banner kind="error">
          {error}
        </Banner>
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

        <div className="analytics-refresh-row">
          <span>Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <button
            type="button"
            className="btn btn-outline small"
            onClick={() => void fetchData()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* 7 Sub-Tabs Navigation */}
      <nav className="analytics-tabs" aria-label="Analytics sub-tabs">
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          <span className="live-pulse-dot" style={{ width: '7px', height: '7px' }} />
          Live Visitors
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          User Activity
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          Audio Analytics
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'booking' ? 'active' : ''}`}
          onClick={() => setActiveTab('booking')}
        >
          Booking Analytics
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'traffic' ? 'active' : ''}`}
          onClick={() => setActiveTab('traffic')}
        >
          Traffic & Audience
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          Reports
        </button>
      </nav>

      {/* Tab Panels */}
      {activeTab === 'overview' && (
        <OverviewTab data={overviewData} loading={loading} />
      )}

      {activeTab === 'live' && (
        <LiveVisitorsTab
          data={liveData}
          loading={loading}
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
        <AudioAnalyticsTab data={audioData} loading={loading} />
      )}

      {activeTab === 'booking' && (
        <BookingAnalyticsTab data={bookingData} loading={loading} />
      )}

      {activeTab === 'traffic' && (
        <TrafficAudienceTab data={trafficData} loading={loading} />
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
