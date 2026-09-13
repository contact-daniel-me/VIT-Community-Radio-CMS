import { useState } from 'react';
import { PageHeader } from '@/components/ui';
import { GamificationOverview } from './GamificationOverview';
import { UserGamificationTable } from './UserGamificationTable';
import { BadgeManagement } from './BadgeManagement';
import { GamificationAnalytics } from './GamificationAnalytics';

type Tab = 'overview' | 'users' | 'badges' | 'analytics';

export function AdminGamificationDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'badges', label: 'Badges' },
    { id: 'analytics', label: 'Analytics' },
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
        {activeTab === 'overview' && <GamificationOverview />}
        {activeTab === 'users' && <UserGamificationTable />}
        {activeTab === 'badges' && <BadgeManagement />}
        {activeTab === 'analytics' && <GamificationAnalytics />}
      </div>
    </>
  );
}
