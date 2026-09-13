import { Link } from 'react-router-dom';

export function MetricCard({ title, value, status }: { title: string; value: number | string; status?: 'booked' | 'approved' | 'audio' | 'final' | 'qc' }) {
  let statusClass = 'bg-surface';
  if (status === 'booked') statusClass = 'bg-booked';
  if (status === 'approved') statusClass = 'bg-approved';
  if (status === 'audio') statusClass = 'bg-audio';
  if (status === 'final') statusClass = 'bg-final';
  if (status === 'qc') statusClass = 'bg-qc';

  return (
    <div className={`card text-center fade-in hover-raise ${statusClass}`} style={{ padding: '1rem', flex: 1, minWidth: '120px' }}>
      <div className="muted small uppercase" style={{ fontWeight: 600, letterSpacing: '0.5px' }}>{title}</div>
      <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{value}</div>
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

export function QuickAction({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="button secondary hover-raise" style={{ flex: '1 1 auto', textAlign: 'center' }}>
      {label}
    </Link>
  );
}

export function PipelineVisual({ metrics }: { metrics: { booked: number, approved: number, audio_upload: number, final_upload: number, qc_done: number } }) {
  return (
    <div className="card row spread wrap align-center fade-in" style={{ gap: '1rem', background: 'var(--color-bg-subtle)' }}>
      <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>Production Pipeline</h3>
      <div className="row wrap" style={{ gap: '0.5rem', flex: 1, justifyContent: 'flex-end', fontSize: '1.1rem' }}>
        <span className="badge badge-yellow" title="Booked">🟡 {metrics.booked}</span>
        <span className="muted">→</span>
        <span className="badge badge-blue" title="Approved">🔵 {metrics.approved}</span>
        <span className="muted">→</span>
        <span className="badge badge-orange" title="Audio Upload">🟠 {metrics.audio_upload}</span>
        <span className="muted">→</span>
        <span className="badge badge-pink" title="Final Upload">🩷 {metrics.final_upload}</span>
        <span className="muted">→</span>
        <span className="badge badge-green" title="QC Done">🟢 {metrics.qc_done}</span>
      </div>
    </div>
  );
}
