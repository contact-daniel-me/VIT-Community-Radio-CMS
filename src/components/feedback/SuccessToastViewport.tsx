import { useEffect, useRef, useState } from 'react';
import type { FeedbackVariant, ToastItem } from '@/context/successFeedbackContext';

function ToastIcon({ variant }: { variant: FeedbackVariant }) {
  if (variant === 'publish') {
    return (
      <span className="sf-toast-icon sf-toast-icon--publish" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" opacity="0.25" />
          <path
            className="sf-check-path"
            d="M7.5 12.4l3 3 6-6.2"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (variant === 'booking') {
    return (
      <span className="sf-toast-icon sf-toast-icon--booking" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
          <path
            className="sf-check-path"
            d="M5.5 12.5l4.2 4.2 8.8-8.9"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (variant === 'upload') {
    return (
      <span className="sf-toast-icon sf-toast-icon--upload" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path
            className="sf-check-path"
            d="M12 15V5.5M8.5 9L12 5.5 15.5 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 17.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  if (variant === 'approval') {
    return (
      <span className="sf-toast-icon sf-toast-icon--approval" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path
            className="sf-check-path"
            d="M6.5 12.5l3.5 3.5 7.5-8"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className="sf-toast-icon sf-toast-icon--save" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
        <path
          d="M6.5 12.5l3.5 3.5 7.5-8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.durationMs);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, Math.max(400, remainingRef.current));

    return () => {
      window.clearTimeout(timer);
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      className={`sf-toast sf-toast--${toast.variant}`}
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ToastIcon variant={toast.variant} />
      <div className="sf-toast-content">
        <div className="sf-toast-header">
          <strong className="sf-toast-title">{toast.title}</strong>
          {toast.badgeText && (
            <span className="sf-toast-live-pill">
              <span className="sf-toast-live-dot" aria-hidden="true" />
              {toast.badgeText}
            </span>
          )}
        </div>
        {toast.detail && <p className="sf-toast-detail">{toast.detail}</p>}
      </div>
      <button
        type="button"
        className="sf-toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss notification: ${toast.title}`}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            d="M4 4l8 8M12 4l-8 8"
          />
        </svg>
      </button>
    </div>
  );
}

export function SuccessToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="sf-toast-viewport" aria-live="polite" aria-relevant="additions text">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

