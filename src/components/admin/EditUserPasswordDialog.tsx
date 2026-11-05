import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner } from '@/components/ui';
import { userService } from '@/services/userService';
import { ROLE_LABELS } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import type { ProfileRow } from '@/types/database';

export interface EditUserPasswordDialogProps {
  user: ProfileRow;
  onClose: () => void;
  onSuccess: (notice: string) => void;
}

const MIN_PASSWORD_LENGTH = 8;

export function EditUserPasswordDialog({
  user,
  onClose,
  onSuccess,
}: EditUserPasswordDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, busy]);

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let generated = '';
    for (let i = 0; i < 12; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
    setShowConfirm(true);
    setError(null);
  };

  const copyPassword = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await userService.updateUserPassword(user.id, newPassword);
      onSuccess(`Password updated successfully for ${user.full_name} (${user.email}).`);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-password-modal-title"
        ref={dialogRef}
        tabIndex={-1}
        style={{ maxWidth: '480px' }}
      >
        <header className="dialog-head">
          <div>
            <p className="dialog-eyebrow">ADMINISTRATION</p>
            <h2 id="edit-password-modal-title" className="dialog-title">
              Edit User Password
            </h2>
            <p className="dialog-slot">
              {user.full_name} &middot; <span className="muted">{user.email}</span> &middot;{' '}
              <span className="badge badge-grey" style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}>
                {ROLE_LABELS[user.role]}
              </span>
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="dialog-body stack" style={{ gap: '1.25rem' }}>
          <Banner>{error}</Banner>

          <div
            style={{
              background: 'var(--surface-sunken)',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--r-md, 8px)',
              border: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Generate Secure Password</p>
              <p className="small muted" style={{ margin: '0.15rem 0 0' }}>
                Quickly create a random 12-character password.
              </p>
            </div>
            <button
              type="button"
              className="small secondary"
              onClick={generateRandomPassword}
              disabled={busy}
            >
              Generate
            </button>
          </div>

          <div className="form-grid" style={{ gap: '1rem' }}>
            <div>
              <label htmlFor="modal-new-password" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                New Password <span style={{ color: 'var(--accent, #e11d48)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="modal-new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  disabled={busy}
                  autoComplete="new-password"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    right: '0.65rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="modal-confirm-password" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                Confirm Password <span style={{ color: 'var(--accent, #e11d48)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="modal-confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  disabled={busy}
                  autoComplete="new-password"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  title={showConfirm ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    right: '0.65rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showConfirm ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {newPassword && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.5rem' }}>
              <button
                type="button"
                className="small outline"
                onClick={copyPassword}
                style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
              >
                {copied ? 'Copied to clipboard!' : 'Copy password to clipboard'}
              </button>
            </div>
          )}

          <div
            className="dialog-actions"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '0.5rem',
              borderTop: '1px solid var(--border)',
              paddingTop: '1rem',
            }}
          >
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={busy || !newPassword || !confirmPassword}
            >
              {busy ? 'Updating...' : 'Set Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

