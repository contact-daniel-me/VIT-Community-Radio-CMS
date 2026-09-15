import React from 'react';
import { Link } from 'react-router-dom';

export function MetricCard({ title, value, status, icon, to }: { title: string; value: number | string; status?: 'booked' | 'approved' | 'audio' | 'final' | 'qc' | 'total'; icon?: React.ReactNode; to?: string }) {
  let statusClass = 'metric-blue';
  if (status === 'booked') statusClass = 'metric-blue'; // Today's slots
  if (status === 'approved') statusClass = 'metric-orange'; // Pending QC
  if (status === 'audio') statusClass = 'metric-pink';
  if (status === 'final') statusClass = 'metric-pink'; // Final upload
  if (status === 'qc') statusClass = 'metric-green';
  if (status === 'total') statusClass = 'metric-purple';

  const content = (
    <>
      {icon && <div className="icon-box">{icon}</div>}
      <div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', lineHeight: 1 }}>{value}</div>
        <div className="uppercase" style={{ fontWeight: 600, letterSpacing: '0.5px', fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.9 }}>{title}</div>
      </div>
    </>
  );

  const className = `card fade-in hover-raise ${statusClass}`;
  const style: React.CSSProperties = { padding: '1.25rem', flex: 1, minWidth: '160px', display: 'flex', gap: '1rem', alignItems: 'center', textDecoration: 'none', color: 'inherit' };

  if (to) {
    return (
      <Link to={to} className={className} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

export function CompactEmptyState({ message, actionText, actionLink }: { message: string; actionText?: string; actionLink?: string }) {
  return (
    <div className="card text-center muted" style={{ padding: '1.5rem', background: 'var(--color-bg-subtle)' }}>
      <p style={{ margin: 0 }}>✓ {message}</p>
      {actionText && actionLink && (
        <div style={{ marginTop: '0.75rem' }}>
          <Link to={actionLink} className="button small primary">{actionText}</Link>
        </div>
      )}
    </div>
  );
}

export function QuickAction({ to, label, icon, colorClass = 'metric-blue' }: { to: string; label: string; icon?: React.ReactNode; colorClass?: string }) {
  return (
    <Link to={to} className={`card fade-in hover-raise ${colorClass}`} style={{ flex: '1 1 auto', minWidth: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textDecoration: 'none', padding: '1rem' }}>
      {icon && <div className="icon-box" style={{ background: 'rgba(255,255,255,0.4)', boxShadow: 'none' }}>{icon}</div>}
      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{label}</span>
    </Link>
  );
}

export function PipelineVisual({ metrics }: { metrics: { booked: number, approved: number, audio_upload: number, final_upload: number, qc_done: number } }) {
  const steps = [
    { label: 'Booked', value: metrics.booked, color: 'var(--status-booked-border)', bg: 'var(--status-booked-bg)', desc: 'Slots reserved' },
    { label: 'Approved', value: metrics.approved, color: 'var(--status-approved-border)', bg: 'var(--status-approved-bg)', desc: 'Ready to record' },
    { label: 'Audio Upload', value: metrics.audio_upload, color: 'var(--status-audio-upload-border)', bg: 'var(--status-audio-upload-bg)', desc: 'Audio submitted' },
    { label: 'Final Uploaded', value: metrics.final_upload, color: 'var(--status-final-upload-border)', bg: 'var(--status-final-upload-bg)', desc: 'Awaiting final' },
    { label: 'QC Done', value: metrics.qc_done, color: 'var(--status-qc-done-border)', bg: 'var(--status-qc-done-bg)', desc: 'Completed' },
  ];

  return (
    <div className="card fade-in" style={{ padding: '1.5rem' }}>
      <div className="row spread align-center" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0 }}>Production Pipeline</h3>
        <Link to="/bookings" className="muted small" style={{ textDecoration: 'none', fontWeight: 600 }}>View all →</Link>
      </div>
      
      <div className="row spread align-center" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <div className="stack align-center" style={{ textAlign: 'center', minWidth: '80px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: step.bg, border: `2px solid ${step.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.25rem', color: step.color, marginBottom: '0.25rem' }}>
                {step.value}
              </div>
              <strong style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{step.label}</strong>
              <span className="muted" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{step.desc}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ color: 'var(--line-strong)', padding: '0 0.5rem', paddingBottom: '1.5rem' }}>→</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
