import { useEffect, useState } from 'react';
import { usePwa } from '@/hooks/usePwa';

export function OfflineIndicator() {
  const { isOffline } = usePwa();
  const [showRestored, setShowRestored] = useState(false);
  const [hasBeenOffline, setHasBeenOffline] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setHasBeenOffline(true);
      setShowRestored(false);
    } else if (hasBeenOffline) {
      setShowRestored(true);
      const timer = setTimeout(() => {
        setShowRestored(false);
        setHasBeenOffline(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isOffline, hasBeenOffline]);

  if (!isOffline && !showRestored) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fade-in"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.6rem 1.1rem',
        borderRadius: 'var(--r-md)',
        fontSize: '0.85rem',
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        background: isOffline ? 'var(--warn-wash, #fdf3e3)' : 'var(--ok-wash, #eaf6ee)',
        color: isOffline ? 'var(--warn, #8a5300)' : 'var(--ok, #17703a)',
        border: `1px solid ${isOffline ? 'var(--warn)' : 'var(--ok)'}`,
        maxWidth: '92vw',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '1rem' }}>
        {isOffline ? '⚠' : '✓'}
      </span>
      <span>
        {isOffline
          ? 'You are currently offline. Station playback and audio uploads require an active connection.'
          : 'Internet connection restored.'}
      </span>
    </div>
  );
}
