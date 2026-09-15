import { useState, type ReactNode } from 'react';
import type { EpisodeStatus, ScheduleStatus } from '@/types/database';

export function Banner({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading...' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

const EPISODE_BADGE: Record<EpisodeStatus, { tone: string; label: string }> = {
  DRAFT: { tone: 'badge-grey', label: 'Draft' },
  PENDING_QC: { tone: 'badge-amber', label: 'Pending QC' },
  APPROVED: { tone: 'badge-green', label: 'Approved' },
  REJECTED: { tone: 'badge-red', label: 'Rejected' },
  ARCHIVED: { tone: 'badge-grey', label: 'Archived' },
};

const SCHEDULE_BADGE: Record<ScheduleStatus, { tone: string; label: string }> = {
  SCHEDULED: { tone: 'badge-blue', label: 'Scheduled' },
  ON_AIR: { tone: 'badge-red', label: 'On air' },
  COMPLETED: { tone: 'badge-grey', label: 'Completed' },
  CANCELLED: { tone: 'badge-grey', label: 'Cancelled' },
};

export function EpisodeStatusBadge({ status }: { status: EpisodeStatus }) {
  const badge = EPISODE_BADGE[status];
  return <span className={`badge ${badge.tone}`}>{badge.label}</span>;
}

export function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  const badge = SCHEDULE_BADGE[status];
  return <span className={`badge ${badge.tone}`}>{badge.label}</span>;
}

export function UnifiedStatusBadge({
  booking,
  episode,
}: {
  booking?: { status: string; script_status: string } | null;
  episode?: { status: string; audio_file_id: string | null; final_audio_file_id?: string | null } | null;
}) {
  if (episode?.status === 'APPROVED') {
    return <span className="badge badge-green">QC Done</span>;
  }
  if (episode?.final_audio_file_id) {
    return <span className="badge badge-pink">Final Upload</span>;
  }
  if (episode?.audio_file_id) {
    return <span className="badge badge-orange">Audio Uploaded</span>;
  }
  if (booking?.script_status === 'YES') {
    return <span className="badge badge-blue">Studio Booked</span>;
  }
  if (booking?.status === 'CONFIRMED' || booking?.status === 'COMPLETED') {
    return <span className="badge badge-yellow">Booked Slot</span>;
  }

  // Fallback for episode-only views
  if (episode) {
    if (episode.status === 'PENDING_QC') return <span className="badge badge-amber">Pending QC</span>;
    if (episode.status === 'REJECTED') return <span className="badge badge-red">Rejected</span>;
    if (episode.status === 'ARCHIVED') return <span className="badge badge-grey">Archived</span>;
    return <span className="badge badge-grey">Draft</span>;
  }

  // Fallback for booking-only views
  if (booking) {
    if (booking.status === 'CANCELLED') return <span className="badge badge-grey">Cancelled</span>;
    if (booking.status === 'NO_SHOW') return <span className="badge badge-grey">No Show</span>;
    if (booking.script_status === 'PENDING') return <span className="badge badge-yellow">Pending Script</span>;
  }

  return <span className="badge badge-grey">Unknown</span>;
}

export function getUnifiedStatusClass({
  booking,
  episode,
}: {
  booking?: { status: string; script_status: string } | null;
  episode?: { status: string; audio_file_id: string | null; final_audio_file_id?: string | null } | null;
}) {
  if (episode?.status === 'APPROVED') return 'status-qc-done';
  if (episode?.final_audio_file_id) return 'status-final-upload';
  if (episode?.audio_file_id) return 'status-audio-upload';
  if (booking?.script_status === 'YES') return 'status-approved';
  if (booking?.status === 'CONFIRMED' || booking?.status === 'COMPLETED') return 'status-booked';

  if (episode?.status === 'ARCHIVED') return 'status-archived';
  if (booking?.status === 'CANCELLED' || booking?.status === 'NO_SHOW') return 'status-archived';
  
  return '';
}

/**
 * Two-step confirmation without a modal: the button asks, then acts.
 * Used for anything destructive-ish (cancel a slot, deactivate a program).
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Sure?',
  className = '',
  disabled,
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <button
      type="button"
      className={`${className} ${armed ? 'danger' : ''}`.trim()}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          window.setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
