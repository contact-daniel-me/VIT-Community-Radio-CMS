import { useState, useRef, useEffect } from 'react';
import { buildEpisodeShareUrl } from '@/utils/sharing';
import { formatDate } from '@/utils/datetime';

interface ShareEpisodeDialogProps {
  episode: {
    id: string;
    title: string;
    program?: { name: string } | null;
    scheduled_at?: string | null;
    homepage_publish_at?: string | null;
    published_at?: string | null;
  };
  onClose: () => void;
}

export function ShareEpisodeDialog({ episode, onClose }: ShareEpisodeDialogProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shareUrl = buildEpisodeShareUrl(episode.id);
  const publishedTime = episode.published_at || episode.homepage_publish_at || episode.scheduled_at;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else if (inputRef.current) {
        inputRef.current.select();
        document.execCommand('copy');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.warn('Failed to copy share link to clipboard:', err);
      inputRef.current?.select();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="dialog share-episode-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        style={{
          maxWidth: '520px',
          width: '100%',
          overflow: 'hidden',
          borderRadius: '8px',
        }}
      >
        {/* Header */}
        <div className="dialog-head">
          <div>
            <p className="dialog-eyebrow" style={{ color: 'var(--accent, #e50914)' }}>
              Public Link
            </p>
            <h2 className="dialog-title" id="share-dialog-title">
              Share Public Episode
            </h2>
            <p className="dialog-slot">
              {episode.program?.name ? `${episode.program.name} · ` : ''}
              {episode.title}
            </p>
          </div>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        {/* Body Content */}
        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Episode Information Card */}
          <div
            style={{
              padding: '0.85rem 1rem',
              background: 'var(--surface-sunken, #f8fafc)',
              borderRadius: '6px',
              border: '1px solid var(--border, #e2e8f0)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span className="badge badge-green" style={{ fontSize: '0.75rem' }}>
                Status: Published
              </span>
              <span className="small muted" style={{ fontSize: '0.78rem' }}>
                {publishedTime ? `Published: ${formatDate(publishedTime)}` : 'Available on 90.8 FM'}
              </span>
            </div>
            <p className="small muted" style={{ margin: 0, fontSize: '0.84rem', lineHeight: '1.45' }}>
              Anyone with this public link can listen to the final QC-approved episode directly from the VIT Community Radio website without logging in.
            </p>
          </div>

          {/* Public Episode URL */}
          <div>
            <label
              htmlFor="share-episode-url-input"
              className="small"
              style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}
            >
              Public Episode URL
            </label>
            <div
              className="share-url-container"
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <input
                id="share-episode-url-input"
                ref={inputRef}
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.86rem',
                  padding: '0.55rem 0.75rem',
                  flex: '1 1 240px',
                  minWidth: 0,
                  background: 'var(--surface, #fff)',
                  border: '1px solid var(--border, #cbd5e1)',
                  borderRadius: '6px',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              />
              <button
                type="button"
                className={`btn btn-copy-share-url ${copied ? 'primary' : 'btn-outline'}`}
                onClick={handleCopy}
                style={{
                  whiteSpace: 'nowrap',
                  padding: '0.55rem 1rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  minWidth: '110px',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {copied ? (
                  <>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path fill="currentColor" d="m9 16.17 9.88-9.88 1.41 1.41L9 19 3.29 13.29l1.41-1.41z" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                      />
                    </svg>
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
            {copied && (
              <p className="small" style={{ color: 'var(--success, #16a34a)', marginTop: '0.4rem', marginBottom: 0 }}>
                Link copied to clipboard! You can share it with external listeners.
              </p>
            )}
          </div>
        </div>

        {/* Footer with subtle divider and bottom-right Done button */}
        <div
          className="dialog-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '0.85rem 1.25rem',
            borderTop: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface-sunken, #f8fafc)',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            style={{
              padding: '0.45rem 1.25rem',
              minWidth: '85px',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
