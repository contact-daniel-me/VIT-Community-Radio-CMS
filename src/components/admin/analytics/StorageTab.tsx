import { StorageHealthCard } from '@/components/admin/StorageHealthCard';

export function StorageTab() {
  return (
    <div className="analytics-storage-tab" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <StorageHealthCard />
    </div>
  );
}
