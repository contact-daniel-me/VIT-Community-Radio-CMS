import { PageHeader } from '@/components/ui';
import { StorageHealthCard } from '@/components/admin/StorageHealthCard';

export function StoragePage() {
  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Storage & Infrastructure"
        description="Live observability, reconciliation, and health monitoring for the Supabase + Cloudflare R2 hybrid storage architecture."
      />
      <StorageHealthCard />
    </div>
  );
}
