import React from 'react';
import {
  useFunnyLoadingMessage,
  type UseFunnyLoadingOptions,
} from '@/hooks/useFunnyLoadingMessage';
import { RETRY_LOADING_MESSAGE } from '@/constants/loadingMessages';
export type { LoadingCategory } from '@/constants/loadingMessages';

export interface FunnyLoadingProps extends UseFunnyLoadingOptions {
  /** Main contextual description, e.g. "Loading schedule..." or "Uploading audio..." */
  label?: string;
  /** Presentation style */
  variant?: 'inline' | 'block' | 'fullscreen' | 'upload';
  /** Upload or task progress percentage (0 - 100) */
  progress?: number | null;
  /** Whether the upload has finished transferring and is now transcoding/processing */
  isProcessing?: boolean;
  /** Error message to show if operation failed */
  error?: string | null;
  /** Callback to retry when an error occurs */
  onRetry?: () => void;
  /** Additional CSS class names */
  className?: string;
  /** Inline CSS style overrides */
  style?: React.CSSProperties;
}

export function FunnyLoading({
  label,
  variant = 'block',
  category = 'all',
  intervalMs = 3200,
  initialMessage,
  progress,
  isProcessing = false,
  error,
  onRetry,
  className = '',
  style,
}: FunnyLoadingProps) {
  const { message, isFading, isOffline } = useFunnyLoadingMessage({
    category: variant === 'upload' ? 'upload' : category,
    intervalMs,
    initialMessage,
  });

  // If there's an error, show friendly retry container instead of perpetual spinner
  if (error) {
    return (
      <div
        className={`funny-loading-error ${className}`}
        role="alert"
        style={{
          padding: '1.25rem',
          textAlign: 'center',
          background: 'var(--warn-wash, #fdf3e3)',
          border: '1px solid var(--warn, #b45309)',
          borderRadius: 'var(--r-md, 8px)',
          margin: '0.75rem 0',
          ...style,
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }} aria-hidden="true">
          ⚠️
        </div>
        <div style={{ fontWeight: 600, color: 'var(--accent, #b45309)', marginBottom: '0.25rem' }}>
          {error}
        </div>
        <p className="small muted" style={{ margin: '0 0 0.75rem' }}>
          {RETRY_LOADING_MESSAGE}
        </p>
        {onRetry && (
          <button
            type="button"
            className="btn btn-outline small"
            onClick={onRetry}
            style={{ minWidth: '90px', cursor: 'pointer' }}
          >
            ↻ Try Again
          </button>
        )}
      </div>
    );
  }

  // Upload Progress variant
  if (variant === 'upload') {
    const isTranscoding = isProcessing || progress === 100;
    const progressPercent = Math.min(100, Math.max(0, progress ?? 0));

    return (
      <div
        className={`funny-loading-upload ${className}`}
        role="status"
        aria-live="polite"
        style={{
          padding: '1rem',
          background: 'var(--surface-raised, rgba(0,0,0,0.02))',
          border: '1px solid var(--line, #e5e7eb)',
          borderRadius: 'var(--r-md, 8px)',
          margin: '0.75rem 0',
          ...style,
        }}
      >
        <div className="row spread align-center" style={{ marginBottom: '0.45rem' }}>
          <div className="row align-center" style={{ gap: '0.5rem' }}>
            <span className="upload-spinner" aria-hidden="true" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {isTranscoding ? 'Finalizing audio on 90.8 FM server...' : label || 'Uploading audio...'}
            </span>
          </div>
          <span
            className="font-mono small"
            style={{ fontWeight: 700, color: 'var(--brand-red, #D32F2F)' }}
          >
            {isTranscoding ? 'Processing' : `${progressPercent}%`}
          </span>
        </div>

        {/* Real Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '7px',
            backgroundColor: 'var(--bg-sunk, #e5e7eb)',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '0.6rem',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: 'var(--brand-red, #D32F2F)',
              transition: 'width 0.25s ease-out',
              borderRadius: '4px',
            }}
          />
        </div>

        {/* Rotating Funny Message */}
        <div
          className={`funny-quip-text ${isFading ? 'is-fading' : ''}`}
          style={{
            fontSize: '0.85rem',
            color: 'var(--ink-muted, #64748b)',
            fontStyle: 'italic',
            textAlign: 'center',
            minHeight: '1.4rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
            opacity: isFading ? 0 : 1,
            transform: isFading ? 'translateY(2px)' : 'translateY(0)',
          }}
        >
          ✨ {message}
        </div>
      </div>
    );
  }

  // Inline subtle variant
  if (variant === 'inline') {
    return (
      <div
        className={`funny-loading-inline ${className}`}
        role="status"
        aria-live="polite"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.4rem 0.6rem',
          fontSize: '0.85rem',
          color: 'var(--muted, #6b7280)',
          ...style,
        }}
      >
        <span className="upload-spinner" aria-hidden="true" style={{ width: '13px', height: '13px' }} />
        {label && <strong style={{ color: 'var(--ink, inherit)' }}>{label}</strong>}
        <span
          className={`funny-quip-text ${isFading ? 'is-fading' : ''}`}
          style={{
            fontStyle: 'italic',
            transition: 'opacity 0.2s ease',
            opacity: isFading ? 0 : 1,
          }}
        >
          &mdash; {message}
        </span>
      </div>
    );
  }

  // Fullscreen / Overlay variant
  if (variant === 'fullscreen') {
    return (
      <div
        className={`funny-loading-fullscreen ${className}`}
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          ...style,
        }}
      >
        <RadioPulseSpinner size={52} />
        {label && (
          <h2
            style={{
              margin: '1.25rem 0 0.5rem',
              fontSize: '1.15rem',
              fontWeight: 600,
              color: 'var(--ink, #1e293b)',
            }}
          >
            {label}
          </h2>
        )}
        <p
          className={`funny-quip-text ${isFading ? 'is-fading' : ''}`}
          style={{
            margin: 0,
            fontSize: '0.98rem',
            color: 'var(--ink-muted, #64748b)',
            fontStyle: 'italic',
            maxWidth: '380px',
            textAlign: 'center',
            minHeight: '2.4rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
            opacity: isFading ? 0 : 1,
            transform: isFading ? 'translateY(2px)' : 'translateY(0)',
          }}
        >
          {isOffline ? '☕ ' : '📻 '}{message}
        </p>
      </div>
    );
  }

  // Default 'block' variant
  return (
    <div
      className={`funny-loading-block ${className}`}
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        textAlign: 'center',
        margin: '0.5rem auto',
        maxWidth: '520px',
        ...style,
      }}
    >
      <RadioPulseSpinner size={38} />
      {label && (
        <div
          style={{
            marginTop: '0.85rem',
            fontSize: '0.92rem',
            fontWeight: 600,
            color: 'var(--ink, #334155)',
          }}
        >
          {label}
        </div>
      )}
      <div
        className={`funny-quip-text ${isFading ? 'is-fading' : ''}`}
        style={{
          marginTop: label ? '0.35rem' : '0.75rem',
          fontSize: '0.88rem',
          color: 'var(--ink-muted, #64748b)',
          fontStyle: 'italic',
          minHeight: '1.6rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          opacity: isFading ? 0 : 1,
          transform: isFading ? 'translateY(2px)' : 'translateY(0)',
        }}
      >
        {isOffline ? '☕ ' : '📻 '}&ldquo;{message}&rdquo;
      </div>
    </div>
  );
}

/**
 * Clean SVG Spinner styled around a broadcast radio antenna pulse
 */
function RadioPulseSpinner({ size = 38 }: { size?: number }) {
  return (
    <div
      className="funny-radio-spinner"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="funny-radio-spinner-svg"
      >
        {/* Outer glowing track */}
        <circle
          cx="22"
          cy="22"
          r="18"
          stroke="var(--line, #e2e8f0)"
          strokeWidth="3"
        />
        {/* Spinning radio frequency ring */}
        <circle
          cx="22"
          cy="22"
          r="18"
          stroke="var(--brand-red, #D32F2F)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray="32 80"
          className="funny-spinner-arc"
        />
        {/* Center radio tower pip */}
        <circle cx="22" cy="22" r="4.5" fill="var(--brand-red, #D32F2F)" />
      </svg>
    </div>
  );
}
