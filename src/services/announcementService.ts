import { supabase } from '@/lib/supabase';
import type { AnnouncementRow, AnnouncementStatus } from '@/types/database';
import { AppError } from '@/lib/errors';

export type AnnouncementWithAuthor = AnnouncementRow & {
  author: {
    full_name: string;
  } | null;
};

/**
 * Single-bucket lifecycle classification for an announcement, ensuring each item
 * appears in one unambiguous state (never both Scheduled and Published, or Draft).
 */
export function computeAnnouncementLifecycleStatus(
  ann: AnnouncementRow,
  now: Date = new Date(),
): AnnouncementStatus {
  if (ann.status === 'ARCHIVED') return 'ARCHIVED';
  if (ann.status === 'FAILED') return 'FAILED';
  if (ann.status === 'EXPIRED') return 'EXPIRED';
  if (ann.status === 'DRAFT') return 'DRAFT';

  const expTime = ann.expires_at ? new Date(ann.expires_at) : null;
  const schedTime = ann.scheduled_at ? new Date(ann.scheduled_at) : null;

  if (ann.status === 'PUBLISHED') {
    if (expTime && !isNaN(expTime.getTime()) && expTime <= now) {
      return 'EXPIRED';
    }
    return 'PUBLISHED';
  }

  // status === 'SCHEDULED'
  if (expTime && !isNaN(expTime.getTime()) && expTime <= now) {
    return 'EXPIRED';
  }
  if (schedTime && !isNaN(schedTime.getTime()) && schedTime <= now) {
    return 'PUBLISHED';
  }
  return 'SCHEDULED';
}

export const announcementService = {
  /**
   * Run atomic server-side lifecycle transitions for announcements & episodes.
   * Graceful no-op when offline or called without an authenticated session.
   */
  async syncLifecycle(): Promise<void> {
    try {
      await supabase.rpc('sync_content_lifecycle');
    } catch {
      // Non-fatal: UI still computes accurate fallback state from persisted timestamps
    }
  },

  /**
   * Fetch announcements for the admin dashboard/management.
   * Synchronizes overdue SCHEDULED -> PUBLISHED and expired PUBLISHED -> EXPIRED first.
   */
  async getAllAnnouncements(): Promise<AnnouncementWithAuthor[]> {
    await this.syncLifecycle();

    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new AppError('UNKNOWN', error.message);
    return data as unknown as AnnouncementWithAuthor[];
  },

  /**
   * Fetch currently active announcements for the public site.
   * Active = PUBLISHED or (SCHEDULED with scheduled_at <= now)
   * AND (expires_at is null or expires_at > now)
   */
  async getActiveAnnouncements(): Promise<AnnouncementRow[]> {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .in('status', ['PUBLISHED', 'SCHEDULED'])
      .order('created_at', { ascending: false });

    if (error) throw new AppError('UNKNOWN', error.message);

    const now = new Date();
    return data.filter((a) => {
      // If it has an expiry and it's past, exclude immediately.
      if (a.expires_at && new Date(a.expires_at) <= now) return false;

      if (a.status === 'PUBLISHED') return true;
      if (a.status === 'SCHEDULED' && a.scheduled_at && new Date(a.scheduled_at) <= now) return true;

      return false;
    });
  },

  async createAnnouncement(payload: {
    title: string;
    message: string;
    status: AnnouncementStatus;
    published_at?: string | null;
    scheduled_at?: string | null;
    expires_at?: string | null;
    publish_error?: string | null;
  }): Promise<AnnouncementRow> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new AppError('AUTH', 'Not signed in');

    const { data, error } = await supabase
      .from('announcements')
      .insert({
        ...payload,
        created_by: user.user.id,
      })
      .select('*')
      .single();

    if (error) throw new AppError('UNKNOWN', error.message);
    return data;
  },

  async updateAnnouncement(
    id: string,
    payload: Partial<Omit<AnnouncementRow, 'id' | 'created_at' | 'updated_at' | 'created_by'>>
  ): Promise<AnnouncementRow> {
    const { data, error } = await supabase
      .from('announcements')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new AppError('UNKNOWN', error.message);
    return data;
  },

  async unscheduleToDraft(id: string): Promise<AnnouncementRow> {
    const { data, error } = await supabase.rpc('unschedule_announcement', {
      p_announcement_id: id,
    });
    if (error) throw new AppError('UNKNOWN', error.message);
    return data;
  },

  async retryAnnouncement(id: string, scheduledAt: string | null = null): Promise<AnnouncementRow> {
    const { data, error } = await supabase.rpc('retry_announcement_publish', {
      p_announcement_id: id,
      p_scheduled_at: scheduledAt,
    });
    if (error) throw new AppError('UNKNOWN', error.message);
    return data;
  },

  async deleteAnnouncement(id: string): Promise<void> {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) throw new AppError('UNKNOWN', error.message);
  }
};
