import { useEffect, useState } from 'react';
import { usePwa } from '@/hooks/usePwa';
import { getNetworkStatus } from '@/lib/dataCache';

export function OfflineIndicator() {
  const { isOffline } = usePwa();
  const [networkInfo, setNetworkInfo] = useState(getNetworkStatus());
  const [syncing, setSyncing] = useState(false);
  const [showRestored, setShowRestored] = useState(false);
  const [hasBeenOffline, setHasBeenOffline] = useState(false);

  useEffect(() => {
    const updateNetwork = () => {
      setNetworkInfo(getNetworkStatus());
    };

    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);

    // Listen to Network Information API changes if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const navConn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (navConn?.addEventListener) {
      navConn.addEventListener('change', updateNetwork);
    }

    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      if (navConn?.removeEventListener) {
        navConn.removeEventListener('change', updateNetwork);
      }
    };
  }, []);

  useEffect(() => {
    if (isOffline) {
      setHasBeenOffline(true);
      setShowRestored(false);
      setSyncing(false);
    } else if (hasBeenOffline) {
      // Reconnected! Enter syncing phase briefly, then restored notification
      setSyncing(true);
      const syncTimer = setTimeout(() => {
        setSyncing(false);
        setShowRestored(true);
        const restoreTimer = setTimeout(() => {
          setShowRestored(false);
          setHasBeenOffline(false);
        }, 3000);
        return () => clearTimeout(restoreTimer);
      }, 1200);
      return () => clearTimeout(syncTimer);
    }
  }, [isOffline, hasBeenOffline]);

  // If fully online and normal speed, render nothing to avoid visual noise
  if (!isOffline && !syncing && !showRestored && !networkInfo.isSlow) {
    return null;
  }

  // Determine pill status theme and message
  let statusBg = 'var(--ok-wash, #eaf6ee)';
  let statusColor = 'var(--ok, #17703a)';
  let statusBorder = 'var(--ok, #17703a)';
  let icon = '✓';
  let message = 'Online · Station data synchronized.';

  if (isOffline) {
    statusBg = 'var(--warn-wash, #fdf3e3)';
    statusColor = 'var(--warn, #8a5300)';
    statusBorder = 'var(--warn, #b45309)';
    icon = '⚠';
    message = 'Offline · Read-only access active. Audio uploads and modifications paused.';
  } else if (syncing) {
    statusBg = 'rgba(235, 245, 255, 0.95)';
    statusColor = '#0284c7';
    statusBorder = '#0284c7';
    icon = '↻';
    message = 'Syncing · Reconnecting to station and updating status...';
  } else if (showRestored) {
    statusBg = 'var(--ok-wash, #eaf6ee)';
    statusColor = 'var(--ok, #17703a)';
    statusBorder = 'var(--ok, #17703a)';
    icon = '✓';
    message = 'Connection restored · Reconnected to VIT Community Radio.';
  } else if (networkInfo.isSlow) {
    statusBg = 'rgba(254, 249, 195, 0.95)';
    statusColor = '#854d0e';
    statusBorder = '#ca8a04';
    icon = '📶';
    message = 'Low Bandwidth Mode · Conserving data; background polling throttled.';
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
        gap: '0.65rem',
        padding: '0.55rem 1.15rem',
        borderRadius: '9999px',
        fontSize: '0.84rem',
        fontWeight: 600,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
        background: statusBg,
        color: statusColor,
        border: `1px solid ${statusBorder}`,
        maxWidth: '92vw',
        backdropFilter: 'blur(8px)',
        transition: 'all 0.25s ease',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '0.95rem' }}>
        {icon}
      </span>
      <span>{message}</span>
    </div>
  );
}
