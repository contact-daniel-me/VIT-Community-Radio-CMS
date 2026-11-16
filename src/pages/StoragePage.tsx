import { Navigate } from 'react-router-dom';

/**
 * Storage section is now integrated into the Analytics Center under the "Storage" tab.
 * Preserves legacy route compatibility by redirecting seamlessly.
 */
export function StoragePage() {
  return <Navigate to="/admin/analytics?tab=storage" replace />;
}

