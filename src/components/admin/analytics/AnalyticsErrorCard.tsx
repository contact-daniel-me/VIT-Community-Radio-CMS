import { useState } from 'react';

interface AnalyticsErrorCardProps {
  title?: string;
  error: string;
  onRetry?: () => void | Promise<void>;
}

export function AnalyticsErrorCard({
  title = 'Unable to Load Analytics Data',
  error,
  onRetry,
}: AnalyticsErrorCardProps) {
  const [retrying, setRetrying] = useState(false);

  const isSchemaError =
    error.toLowerCase().includes('schema cache') ||
    error.toLowerCase().includes('function public.') ||
    error.toLowerCase().includes('pgrst202') ||
    error.toLowerCase().includes('pgrst205');

  const isAuthError =
    error.toLowerCase().includes('42501') ||
    error.toLowerCase().includes('unauthorized') ||
    error.toLowerCase().includes('permission denied');

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    try {
      setRetrying(true);
      await Promise.resolve(onRetry());
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="analytics-error-card" role="alert">
      <div className="analytics-error-card-icon" aria-hidden="true">
        ⚠️
      </div>
      <h3 className="analytics-error-card-title">{title}</h3>
      <p className="analytics-error-card-msg">{error}</p>

      {isSchemaError && (
        <div className="analytics-error-hint">
          <strong>Database Notice:</strong> The analytics database tables or RPC functions have
          not yet been applied to your Supabase project, or the schema cache is refreshing.
          Run the migration in <code>supabase/deploy/analytics_center_setup.sql</code> in your
          Supabase SQL Editor, then retry.
        </div>
      )}

      {isAuthError && (
        <div className="analytics-error-hint">
          <strong>Access Notice:</strong> Only station administrators have permission to access
          Analytics Center metrics. Ensure you are signed in with an ADMIN account.
        </div>
      )}

      {onRetry && (
        <button
          type="button"
          className="analytics-retry-btn"
          onClick={() => void handleRetry()}
          disabled={retrying}
        >
          {retrying ? 'Retrying...' : 'Retry Now'}
        </button>
      )}
    </div>
  );
}
