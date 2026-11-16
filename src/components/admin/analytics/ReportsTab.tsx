import { useState } from 'react';
import type { AnalyticsOverviewData } from '@/services/analyticsService';
import { analyticsService } from '@/services/analyticsService';
import { FunnyLoading } from '@/components/ui';

interface ReportsTabProps {
  overviewData: AnalyticsOverviewData | null;
  startDate: string;
  endDate: string;
}

export function ReportsTab({ overviewData, startDate, endDate }: ReportsTabProps) {
  const [reportType, setReportType] = useState<'OVERVIEW' | 'ACTIVITY' | 'AUDIO' | 'BOOKING'>('OVERVIEW');
  const [exporting, setExporting] = useState(false);

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const startClean = startDate.slice(0, 10);
      const endClean = endDate.slice(0, 10);

      if (reportType === 'OVERVIEW') {
        if (!overviewData) return;
        const rows = [
          ['VIT Community Radio 90.8 FM - Analytics Overview Report'],
          [`Period: ${startClean} to ${endClean}`],
          [''],
          ['Metric Category', 'Metric Name', 'Value'],
          ['Website', 'Total Visitors', overviewData.website.total_visitors],
          ['Website', 'Unique Visitors', overviewData.website.unique_visitors],
          ['Website', 'Total Sessions', overviewData.website.total_sessions],
          ['Website', 'Page Views', overviewData.website.page_views],
          ['Website', 'New Visitors', overviewData.website.new_visitors],
          ['Website', 'Returning Visitors', overviewData.website.returning_visitors],
          ['Website', 'Avg Engagement Seconds', overviewData.website.avg_engagement_seconds],
          ['Audio', 'Total Audio Plays', overviewData.listening.total_audio_plays],
          ['Audio', 'Unique Listeners', overviewData.listening.unique_listeners],
          ['Audio', 'Total Listening Hours', overviewData.listening.total_listening_hours],
          ['Audio', 'Avg Listening Seconds', overviewData.listening.avg_listening_seconds],
          ['Audio', 'Completed Sessions', overviewData.listening.completed_listening_sessions],
          ['Studio Booking', 'Total Booking Requests', overviewData.booking.total_booking_requests],
          ['Studio Booking', 'Pending Bookings', overviewData.booking.pending_bookings],
          ['Studio Booking', 'Approved Bookings', overviewData.booking.approved_bookings],
          ['Studio Booking', 'Completed Bookings', overviewData.booking.completed_bookings],
          ['Studio Booking', 'Rejected or Cancelled', overviewData.booking.rejected_or_cancelled_bookings],
        ];
        const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
        downloadCSV(csv, `vit_radio_analytics_overview_${startClean}_to_${endClean}.csv`);
      } else if (reportType === 'ACTIVITY') {
        const { logs } = await analyticsService.getUserActivityLogs({
          startDate,
          endDate,
          limit: 500,
        });
        const rows = [
          ['Timestamp', 'User Name', 'Role', 'Event Name', 'Activity Description', 'Page Path', 'Anonymous ID'],
          ...logs.map((l) => [
            l.created_at,
            l.user?.full_name ?? 'Anonymous',
            l.user?.role ?? 'None',
            l.event_name,
            l.activity_description,
            l.page_path,
            l.anonymous_session_id ?? '',
          ]),
        ];
        const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
        downloadCSV(csv, `vit_radio_user_activity_${startClean}_to_${endClean}.csv`);
      } else if (reportType === 'AUDIO') {
        const audioData = await analyticsService.getAudioAnalytics(startDate, endDate);
        const rows = [
          ['Audio Source', 'Type', 'Plays', 'Unique Listeners', 'Total Seconds'],
          ...audioData.popular_content.map((c) => [
            c.audio_source_id,
            c.source_type,
            c.plays,
            c.unique_listeners,
            c.total_seconds,
          ]),
        ];
        const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
        downloadCSV(csv, `vit_radio_audio_listening_${startClean}_to_${endClean}.csv`);
      } else if (reportType === 'BOOKING') {
        const bookingData = await analyticsService.getBookingAnalytics(startDate, endDate);
        const rows = [
          ['Studio Facility', 'Total Bookings'],
          ...bookingData.studios.map((s) => [s.studio_facility, s.total_bookings]),
        ];
        const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
        downloadCSV(csv, `vit_radio_studio_bookings_${startClean}_to_${endClean}.csv`);
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="analytics-section">
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Analytics Reports & CSV Exports</h3>
        <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
          Generate authoritative exportable CSV summaries for audits, station reviews and management reports
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: '0.25rem' }}>
              Select Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="OVERVIEW">Complete Analytics Overview</option>
              <option value="ACTIVITY">User Activity Audit Log</option>
              <option value="AUDIO">Audio Listening & Stream Ledger</option>
              <option value="BOOKING">Studio Booking Funnel Report</option>
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? 'Generating CSV...' : 'Download CSV Report'}
            </button>
          </div>
        </div>

        {exporting && (
          <div style={{ marginTop: '1rem' }}>
            <FunnyLoading label="Compiling verified report records..." />
          </div>
        )}
      </div>

      {/* Preview Card */}
      <div className="analytics-section">
        <h4 className="analytics-section-title">Report Summary Preview</h4>
        {overviewData ? (
          <div className="analytics-kpi-grid">
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">Selected Period</div>
              <div className="analytics-kpi-val" style={{ fontSize: '1.1rem' }}>
                {startDate.slice(0, 10)} to {endDate.slice(0, 10)}
              </div>
              <div className="analytics-kpi-sub">Timeframe for report</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">Total Visitors</div>
              <div className="analytics-kpi-val">{overviewData.website.total_visitors}</div>
              <div className="analytics-kpi-sub">Total client visitors</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">Listening Time</div>
              <div className="analytics-kpi-val">{overviewData.listening.total_listening_hours} hrs</div>
              <div className="analytics-kpi-sub">Audio broadcast time</div>
            </div>
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-header">Bookings Approved</div>
              <div className="analytics-kpi-val">{overviewData.booking.approved_bookings}</div>
              <div className="analytics-kpi-sub">Confirmed recording slots</div>
            </div>
          </div>
        ) : (
          <p className="small muted">Loading overview preview...</p>
        )}
      </div>
    </div>
  );
}
