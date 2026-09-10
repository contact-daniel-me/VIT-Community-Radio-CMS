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
