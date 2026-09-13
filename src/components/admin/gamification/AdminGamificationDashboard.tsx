import { useState } from 'react';
import { PageHeader } from '@/components/ui';
import { UserGamificationTable } from './UserGamificationTable';
import { BadgeManagement } from './BadgeManagement';

type Tab = 'users' | 'badges';

export function AdminGamificationDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('users');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'badges', label: 'Badges' },
  ];

  return (
    <>
      <PageHeader
        title="Gamification Management"
        description="Manage badges, XP, levels, streaks and user achievements."
      />

      <div className="admin-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="admin-tab-content">
        {activeTab === 'users' && <UserGamificationTable />}
        {activeTab === 'badges' && <BadgeManagement />}
      </div>
    </>
  );
}
