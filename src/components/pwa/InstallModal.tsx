import { useEffect } from 'react';
import { usePwa } from '@/hooks/usePwa';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstallModal({ isOpen, onClose }: InstallModalProps) {
  const { isIos } = usePwa();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="dialog-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card fade-in"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--surface)',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          padding: '1.5rem',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-modal-title"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <img
              src="/favicon-192.png"
              alt="VIT Radio"
              style={{ width: '36px', height: '36px', borderRadius: '8px' }}
            />
            <div>
              <h3 id="install-modal-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                Install VIT Community Radio
              </h3>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                90.8 FM &middot; Progressive Web App
              </span>
            </div>
          </div>
          <button
            type="button"
            className="small"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
              fontSize: '1.2rem',
              lineHeight: 1,
              padding: '0.2rem 0.4rem',
            }}
          >
            &times;
          </button>
        </div>

        <p className="small muted" style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>
          Install the VIT Community Radio app on your device for fast access to studio bookings, episode workflows, and broadcast audio.
        </p>

        {isIos ? (
          <div
            style={{
              background: 'var(--bg)',
              padding: '1rem',
              borderRadius: 'var(--r-sm)',
              marginBottom: '1.25rem',
              border: '1px solid var(--line)',
            }}
          >
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}>
              Installing on iOS Safari:
            </h4>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text)' }}>
              <li>
                Tap the <strong>Share</strong> button (the square with an arrow pointing up) in Safari&apos;s toolbar.
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top-right corner to finish.
              </li>
            </ol>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--bg)',
              padding: '1rem',
              borderRadius: 'var(--r-sm)',
              marginBottom: '1.25rem',
              border: '1px solid var(--line)',
            }}
          >
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}>
              Installing on Desktop or Android:
            </h4>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text)' }}>
              <li>
                Look for the <strong>Install</strong> icon in the right side of your browser address bar.
              </li>
              <li>
                Or open the browser menu (<strong>&vellip;</strong>) and select <strong>&quot;Install VIT Community Radio&quot;</strong>.
              </li>
              <li>
                Click <strong>Install</strong> to add the app to your home screen or desktop.
              </li>
            </ol>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <button type="button" className="btn btn-solid small" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
