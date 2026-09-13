import { supabase } from '@/lib/supabase';
import { BADGE_DEFINITIONS, getLevelFromXp } from '@/services/badgeService';

export type LeaderboardFilter = 'all' | 'month' | 'week';

export interface LeaderboardEntry {
  userId: string;
  name: string;
  xp: number;
  badgeCount: number;
  episodeCount: number;
  approvedCount: number;
  bookingCount: number;
  level: number;
  levelTitle: string;
  levelPct: number;
  nextLevelXp: number | null;
}

const XP_PER_EPISODE = 10;
const XP_PER_APPROVED = 25;
const XP_PER_SUBMITTED = 5;
const XP_PER_BOOKING = 15;

function getDateFilter(filter: LeaderboardFilter): string | null {
  if (filter === 'all') return null;
  const now = new Date();
  if (filter === 'week') {
    const d = new Date(now);
    d.setDate(now.getDate() - 7);
    return d.toISOString();
  }
  if (filter === 'month') {
    const d = new Date(now);
    d.setDate(now.getDate() - 30);
    return d.toISOString();
  }
  return null;
}

export const leaderboardService = {
  async getLeaderboard(filter: LeaderboardFilter = 'all'): Promise<LeaderboardEntry[]> {
    const since = getDateFilter(filter);

    // Fetch all active non-admin profiles
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('active', true)
      .neq('role', 'ADMIN');

    if (profileError || !profiles) return [];

    // Parallel: episodes and bookings
    const [episodesRes, bookingsRes] = await Promise.all([
      // All episodes per creator
      supabase
        .from('episodes')
        .select('created_by, status, submitted_at')
        .not('created_by', 'is', null)
        .then(r => r),

      // Bookings per RJ (typed properly)
      supabase
        .from('studio_bookings')
        .select('rj_id, created_at')
        .neq('status', 'CANCELLED')
        .not('rj_id', 'is', null)
        .then(r => r as { data: { rj_id: string; created_at: string }[] | null; error: unknown }),
    ]);

    const episodeRows = episodesRes.data ?? [];
    const bookingRows = bookingsRes.data ?? [];

    // Aggregate counts per user, applying date filter
    const userEpisodes: Record<string, { total: number; approved: number; submitted: number }> = {};
    const userBookings: Record<string, number> = {};

    for (const ep of episodeRows) {
      const uid = ep.created_by as string;
      if (!uid) continue;
      if (!userEpisodes[uid]) userEpisodes[uid] = { total: 0, approved: 0, submitted: 0 };
      userEpisodes[uid].total++;
      if (ep.status === 'APPROVED') userEpisodes[uid].approved++;
      if (ep.submitted_at) userEpisodes[uid].submitted++;
    }

    for (const bk of bookingRows) {
      const uid = bk.rj_id;
      if (!uid) continue;
      if (since && bk.created_at < since) continue;
      userBookings[uid] = (userBookings[uid] ?? 0) + 1;
    }

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = profiles.map((p) => {
      const ep = userEpisodes[p.id] ?? { total: 0, approved: 0, submitted: 0 };
      const bk = userBookings[p.id] ?? 0;

      // XP from activities
      const activityXp =
        ep.total * XP_PER_EPISODE +
        ep.approved * XP_PER_APPROVED +
        ep.submitted * XP_PER_SUBMITTED +
        bk * XP_PER_BOOKING;

      // Count unlocked badges by checking thresholds
      const badgeCount = BADGE_DEFINITIONS.filter((def) => {
        if (def.metric === 'episodeCount') return ep.total >= def.threshold;
        if (def.metric === 'approvedCount') return ep.approved >= def.threshold;
        if (def.metric === 'submittedCount') return ep.submitted >= def.threshold;
        if (def.metric === 'bookingCount') return bk >= def.threshold;
        return false;
      }).length;

      const badgeXpTotal = BADGE_DEFINITIONS
        .filter((def) => {
          if (def.metric === 'episodeCount') return ep.total >= def.threshold;
          if (def.metric === 'approvedCount') return ep.approved >= def.threshold;
          if (def.metric === 'submittedCount') return ep.submitted >= def.threshold;
          if (def.metric === 'bookingCount') return bk >= def.threshold;
          return false;
        })
        .reduce((sum, def) => sum + def.xp, 0);

      const totalXp = activityXp + badgeXpTotal;
      const lvl = getLevelFromXp(totalXp);

      return {
        userId: p.id,
        name: p.full_name,
        xp: totalXp,
        badgeCount,
        episodeCount: ep.total,
        approvedCount: ep.approved,
        bookingCount: bk,
        level: lvl.level.level,
        levelTitle: lvl.level.title,
        levelPct: lvl.pct,
        nextLevelXp: lvl.next?.minXp ?? null,
      };
    });

    // Sort by XP descending, then name ascending for ties
    return entries
      .filter((e) => e.xp > 0 || true) // include all users (even 0 XP)
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  },
};
