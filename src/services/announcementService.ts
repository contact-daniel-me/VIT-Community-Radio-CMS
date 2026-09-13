import { supabase } from '@/lib/supabase';
import type { AnnouncementRow, AnnouncementStatus } from '@/types/database';
import { AppError } from '@/lib/errors';

export type AnnouncementWithAuthor = AnnouncementRow & {
  author: {
    full_name: string;
  } | null;
};

export const announcementService = {
  /**
   * Fetch announcements for the admin dashboard/management.
   */
  async getAllAnnouncements(): Promise<AnnouncementWithAuthor[]> {
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
    // We can just fetch them all and filter in JS if there are few,
    // or use PostgREST filters. Let's use PostgREST for exactness,
    // but complex OR logic is easier in JS for a tiny dataset.
    // We'll fetch non-drafts and filter.
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .neq('status', 'DRAFT')
      .neq('status', 'ARCHIVED')
      .order('created_at', { ascending: false });

    if (error) throw new AppError('UNKNOWN', error.message);

    const now = new Date();
    return data.filter((a) => {
      // If it has an expiry and it's past, filter out.
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

  async deleteAnnouncement(id: string): Promise<void> {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) throw new AppError('UNKNOWN', error.message);
  }
};
