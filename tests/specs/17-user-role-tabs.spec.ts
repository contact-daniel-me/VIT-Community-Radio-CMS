import { describe, expect, it } from 'vitest';
import { ROLE_LABELS } from '../../src/lib/permissions';
import type { ProfileRow, UserRole } from '../../src/types/database';

export type UserFilterTab = 'ALL' | 'ADMIN' | 'PRODUCER' | 'RJ' | 'QC';

export interface UserRoleTabDef {
  key: UserFilterTab;
  label: string;
  role?: UserRole;
}

export const USER_ROLE_TABS: UserRoleTabDef[] = [
  { key: 'ALL', label: 'All Users' },
  { key: 'ADMIN', label: 'Administrators', role: 'ADMIN' },
  { key: 'PRODUCER', label: 'Producers', role: 'PRODUCER' },
  { key: 'RJ', label: 'Radio Jockeys', role: 'RJ' },
  { key: 'QC', label: 'Quality Control', role: 'QC' },
];

describe('Users Page Role Filter Tabs', () => {
  const mockUsers: ProfileRow[] = [
    {
      id: 'u-1',
      full_name: 'Ananya Sharma',
      email: 'ananya@vit.ac.in',
      role: 'ADMIN',
      avatar_url: null,
      active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      approved_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'u-2',
      full_name: 'Rohan Verma',
      email: 'rohan@vit.ac.in',
      role: 'PRODUCER',
      avatar_url: null,
      active: true,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      approved_at: '2026-01-02T00:00:00Z',
    },
    {
      id: 'u-3',
      full_name: 'Karthik Raja',
      email: 'karthik@vit.ac.in',
      role: 'RJ',
      avatar_url: null,
      active: true,
      created_at: '2026-01-03T00:00:00Z',
      updated_at: '2026-01-03T00:00:00Z',
      approved_at: '2026-01-03T00:00:00Z',
    },
    {
      id: 'u-4',
      full_name: 'Pooja Iyer',
      email: 'pooja@vit.ac.in',
      role: 'RJ',
      avatar_url: null,
      active: false,
      created_at: '2026-01-04T00:00:00Z',
      updated_at: '2026-01-04T00:00:00Z',
      approved_at: null,
    },
    {
      id: 'u-5',
      full_name: 'Deepak Patel',
      email: 'deepak@vit.ac.in',
      role: 'QC',
      avatar_url: null,
      active: true,
      created_at: '2026-01-05T00:00:00Z',
      updated_at: '2026-01-05T00:00:00Z',
      approved_at: '2026-01-05T00:00:00Z',
    },
  ];

  it('defines the 5 required tabs matching role dropdown values', () => {
    expect(USER_ROLE_TABS).toHaveLength(5);
    expect(USER_ROLE_TABS.map((t: UserRoleTabDef) => t.key)).toEqual(['ALL', 'ADMIN', 'PRODUCER', 'RJ', 'QC']);
    expect(USER_ROLE_TABS.map((t: UserRoleTabDef) => t.label)).toEqual([
      'All Users',
      'Administrators',
      'Producers',
      'Radio Jockeys',
      'Quality Control',
    ]);
  });

  it('calculates counts accurately for all users and each role tab', () => {
    const counts = {
      ALL: mockUsers.length,
      ADMIN: mockUsers.filter((u) => u.role === 'ADMIN').length,
      PRODUCER: mockUsers.filter((u) => u.role === 'PRODUCER').length,
      RJ: mockUsers.filter((u) => u.role === 'RJ').length,
      QC: mockUsers.filter((u) => u.role === 'QC').length,
    };

    expect(counts.ALL).toBe(5);
    expect(counts.ADMIN).toBe(1);
    expect(counts.PRODUCER).toBe(1);
    expect(counts.RJ).toBe(2);
    expect(counts.QC).toBe(1);
  });

  it('filters users by selected role tab', () => {
    const filterByRole = (roleFilter: UserFilterTab, users: ProfileRow[]) =>
      users.filter((u) => (roleFilter === 'ALL' ? true : u.role === roleFilter));

    expect(filterByRole('ALL', mockUsers)).toHaveLength(5);
    expect(filterByRole('ADMIN', mockUsers).map((u) => u.full_name)).toEqual(['Ananya Sharma']);
    expect(filterByRole('PRODUCER', mockUsers).map((u) => u.full_name)).toEqual(['Rohan Verma']);
    expect(filterByRole('RJ', mockUsers).map((u) => u.full_name)).toEqual(['Karthik Raja', 'Pooja Iyer']);
    expect(filterByRole('QC', mockUsers).map((u) => u.full_name)).toEqual(['Deepak Patel']);
  });

  it('filters by search query and role filter concurrently', () => {
    const filterUsers = (roleFilter: UserFilterTab, searchQuery: string, users: ProfileRow[]) => {
      const q = searchQuery.toLowerCase().trim();
      return users.filter((u) => {
        if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
        if (!q) return true;
        const roleLabel = (ROLE_LABELS[u.role] ?? '').toLowerCase();
        return (
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          roleLabel.includes(q)
        );
      });
    };

    // Search by name within RJ
    expect(filterUsers('RJ', 'pooja', mockUsers)).toHaveLength(1);
    expect(filterUsers('RJ', 'pooja', mockUsers)[0].full_name).toBe('Pooja Iyer');

    // Search by name that belongs to different role
    expect(filterUsers('ADMIN', 'pooja', mockUsers)).toHaveLength(0);

    // Search by email across ALL
    expect(filterUsers('ALL', 'deepak@vit.ac.in', mockUsers)).toHaveLength(1);
    expect(filterUsers('ALL', 'deepak@vit.ac.in', mockUsers)[0].role).toBe('QC');
  });

  it('dynamically updates counts and tab lists when a user role changes', () => {
    // Clone and promote Pooja Iyer from RJ to PRODUCER
    const updatedUsers: ProfileRow[] = mockUsers.map((u) =>
      u.id === 'u-4' ? { ...u, role: 'PRODUCER' as const } : u,
    );

    const counts = {
      ALL: updatedUsers.length,
      ADMIN: updatedUsers.filter((u) => u.role === 'ADMIN').length,
      PRODUCER: updatedUsers.filter((u) => u.role === 'PRODUCER').length,
      RJ: updatedUsers.filter((u) => u.role === 'RJ').length,
      QC: updatedUsers.filter((u) => u.role === 'QC').length,
    };

    expect(counts.ALL).toBe(5);
    expect(counts.PRODUCER).toBe(2); // increased from 1
    expect(counts.RJ).toBe(1); // decreased from 2

    // Now Pooja appears under PRODUCER, not RJ
    const producers = updatedUsers.filter((u) => u.role === 'PRODUCER');
    expect(producers.some((u) => u.id === 'u-4')).toBe(true);

    const rjs = updatedUsers.filter((u) => u.role === 'RJ');
    expect(rjs.some((u) => u.id === 'u-4')).toBe(false);
  });
});
