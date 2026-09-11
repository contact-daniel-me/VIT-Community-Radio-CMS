import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { ActivityLogRow, EntityType } from '@/types/database';

export interface ActivityWithUser extends ActivityLogRow {
  user: { id: string; full_name: string; role: string } | null;
}

const SELECT = '*, user:profiles!activity_logs_user_id_fkey (id, full_name, role)';

/** Human wording for each action the database records. */
const ACTION_LABELS: Record<string, string> = {
  PROGRAM_CREATED: 'created program',
  PROGRAM_UPDATED: 'updated program',
  PROGRAM_ACTIVATED: 'reactivated program',
  PROGRAM_DEACTIVATED: 'deactivated program',
  EPISODE_CREATED: 'created episode',
  EPISODE_UPDATED: 'updated episode',
  EPISODE_SUBMITTED_FOR_QC: 'submitted for QC',
  EPISODE_APPROVED: 'approved episode',
  EPISODE_REJECTED: 'rejected episode',
  EPISODE_REOPENED: 'reopened episode for editing',
  EPISODE_ARCHIVED: 'archived episode',
  AUDIO_UPLOADED: 'uploaded audio',
  AUDIO_DELETED: 'deleted audio',
  SCHEDULE_CREATED: 'scheduled a slot',
  SCHEDULE_UPDATED: 'changed a slot',
  SCHEDULE_CANCELLED: 'cancelled a slot',
  BROADCAST_STARTED: 'went on air',
  BROADCAST_ENDED: 'ended the broadcast',
  BROADCAST_AUTO_COMPLETED: 'closed finished slots',
  PROFILE_ROLE_CHANGED: 'changed a user role',
  PROFILE_ACTIVATED: 'reactivated a user',
  PROFILE_DEACTIVATED: 'deactivated a user',
};

export function describeAction(action: string): string {
  return ACTION_LABELS[action] ?? action.toLowerCase().replace(/_/g, ' ');
}

/** A short, readable subject for a log line, taken from the stored metadata. */
export function describeSubject(entry: ActivityLogRow): string {
  const metadata = entry.metadata ?? {};
  for (const key of ['title', 'name', 'email']) {
    const value = metadata[key];
    if (typeof value === 'string' && value) return value;
  }
  return '';
}

export const activityService = {
  async getRecentActivity(limit = 25): Promise<ActivityWithUser[]> {
    return unwrap(
      supabase
        .from('activity_logs')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(limit)
        .returns<ActivityWithUser[]>(),
    );
  },

  async getActivityForEntity(
    entityType: EntityType,
    entityId: string,
    limit = 25,
  ): Promise<ActivityWithUser[]> {
    return unwrap(
      supabase
        .from('activity_logs')
        .select(SELECT)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(limit)
        .returns<ActivityWithUser[]>(),
    );
  },

  async deleteActivity(id: string): Promise<void> {
    return unwrap(
      supabase.from('activity_logs').delete().eq('id', id)
    );
  },
};
