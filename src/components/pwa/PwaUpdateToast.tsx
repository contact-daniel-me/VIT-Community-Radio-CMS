import { usePwa } from '@/hooks/usePwa';

export function PwaUpdateToast() {
  const { updateAvailable, applyUpdate, dismissUpdate } = usePwa();

  if (!updateAvailable) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="card fade-in"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        right: '1.25rem',
        zIndex: 9999,
        maxWidth: '380px',
        padding: '1rem',
        background: 'var(--surface)',
        borderRadius: 'var(--r-md)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
        border: '1px solid var(--accent)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color: 'var(--accent)', fontSize: '1.1rem' }} aria-hidden="true">
          ✦
        </span>
        <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
          Update available
        </strong>
      </div>

      <p className="small muted" style={{ margin: 0, lineHeight: 1.4 }}>
        A new version of VIT Community Radio is ready. Update now to receive the latest features and improvements.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
        <button
          type="button"
          className="small"
          onClick={dismissUpdate}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          Later
        </button>
        <button
          type="button"
          className="btn btn-solid small"
          onClick={applyUpdate}
          style={{ cursor: 'pointer' }}
        >
          Update now
        </button>
      </div>
    </div>
  );
}
