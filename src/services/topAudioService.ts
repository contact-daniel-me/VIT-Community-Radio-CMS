import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { HomepageFeaturedAudioRow } from '@/types/database';

export const topAudioService = {
  async getAdminTopAudio(): Promise<HomepageFeaturedAudioRow[]> {
    return unwrap(
      supabase
        .from('homepage_featured_audio')
        .select('*')
        .order('display_order', { ascending: true })
    );
  },

  async addTopAudio(episodeId: string, displayOrder: number): Promise<void> {
    await unwrap(
      supabase.from('homepage_featured_audio').insert({
        episode_id: episodeId,
        display_order: displayOrder,
        is_active: true,
      })
    );
  },

  async removeTopAudio(episodeId: string): Promise<void> {
    await unwrap(
      supabase.from('homepage_featured_audio').delete().eq('episode_id', episodeId)
    );
  },

  async updateOrder(updates: { id: string; episode_id: string; display_order: number }[]): Promise<void> {
    await unwrap(
      supabase.from('homepage_featured_audio').upsert(
        updates.map((u) => ({
          id: u.id,
          episode_id: u.episode_id,
          display_order: u.display_order,
        })),
        { onConflict: 'id' }
      )
    );
  },
};
