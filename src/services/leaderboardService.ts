import { supabase } from '@/lib/supabase';
import { 
  badgeService, 
} from '@/services/badgeService';

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

const FALLBACK_XP_RULES: Record<string, number> = {
  'EPISODE_CREATE': 10,
  'EPISODE_QC_APPROVE': 25,
  'EPISODE_QC_SUBMIT': 5,
  'STUDIO_BOOKING': 15,
};

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

    // Fetch config and overrides concurrently with profiles and activity
    const [
      { data: profiles },
      { data: episodesRes },
      { data: bookingsRes },
      { data: xpRulesData, error: xpRulesError },
      badgeDefinitions,
      { data: overridesData }
    ] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('active', true).neq('role', 'ADMIN'),
      supabase.from('episodes').select('created_by, status, submitted_at').not('created_by', 'is', null),
      supabase.from('studio_bookings').select('rj_id, created_at').neq('status', 'CANCELLED').not('rj_id', 'is', null),
      supabase.from('gamification_xp_rules').select('action, xp_reward').eq('active', true),
      badgeService.getBadgeDefinitions(),
      supabase.from('user_gamification_adjustments').select('user_id, xp_adjustment')
    ]);

    if (!profiles) return [];

    const episodeRows = episodesRes ?? [];
    const bookingRows = bookingsRes ?? [];
    
    // Process XP Rules
    const xpRules: Record<string, number> = {};
    if (xpRulesError && xpRulesError.code === '42P01') {
      Object.assign(xpRules, FALLBACK_XP_RULES);
    } else if (xpRulesData) {
      xpRulesData.forEach(r => { xpRules[r.action] = r.xp_reward; });
    }

    // Process Overrides
    const overrides: Record<string, number> = {};
    if (overridesData && overridesData.length > 0) {
      overridesData.forEach(o => {
        overrides[o.user_id] = (overrides[o.user_id] ?? 0) + o.xp_adjustment;
      });
    }

    // Aggregate counts per user, applying date filter
    const userEpisodes: Record<string, { total: number; approved: number; submitted: number }> = {};
    const userBookings: Record<string, number> = {};

    for (const ep of episodeRows) {
      const uid = ep.created_by;
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

    // Fetch dynamic levels
    const levels = await badgeService.getLevels();

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = profiles.map((p) => {
      const ep = userEpisodes[p.id] ?? { total: 0, approved: 0, submitted: 0 };
      const bk = userBookings[p.id] ?? 0;

      // XP from activities
      const activityXp =
        ep.total * (xpRules['EPISODE_CREATE'] || 0) +
        ep.approved * (xpRules['EPISODE_QC_APPROVE'] || 0) +
        ep.submitted * (xpRules['EPISODE_QC_SUBMIT'] || 0) +
        bk * (xpRules['STUDIO_BOOKING'] || 0);

      // Count unlocked badges by checking thresholds against dynamic badge definitions
      const badgeCount = badgeDefinitions.filter((def) => {
        if (def.metric === 'episodeCount') return ep.total >= def.threshold;
        if (def.metric === 'approvedCount') return ep.approved >= def.threshold;
        if (def.metric === 'submittedCount') return ep.submitted >= def.threshold;
        if (def.metric === 'bookingCount') return bk >= def.threshold;
        return false;
      }).length;

      const badgeXpTotal = badgeDefinitions
        .filter((def) => {
          if (def.metric === 'episodeCount') return ep.total >= def.threshold;
          if (def.metric === 'approvedCount') return ep.approved >= def.threshold;
          if (def.metric === 'submittedCount') return ep.submitted >= def.threshold;
          if (def.metric === 'bookingCount') return bk >= def.threshold;
          return false;
        })
        .reduce((sum, def) => sum + def.xp, 0);

      const manualAdjustment = overrides[p.id] ?? 0;
      const totalXp = Math.max(0, activityXp + badgeXpTotal + manualAdjustment);
      
      // Calculate level
      let current = levels[0];
      for (const lvl of levels) {
        if (totalXp >= lvl.minXp) current = lvl;
        else break;
      }
      const idx = levels.indexOf(current);
      const next = levels[idx + 1] ?? null;
      const progressInLevel = totalXp - current.minXp;
      const rangeInLevel = next ? next.minXp - current.minXp : 1;
      const levelPct = Math.min(100, Math.round((progressInLevel / rangeInLevel) * 100));

      return {
        userId: p.id,
        name: p.full_name,
        xp: totalXp,
        badgeCount,
        episodeCount: ep.total,
        approvedCount: ep.approved,
        bookingCount: bk,
        level: current.level,
        levelTitle: current.title,
        levelPct,
        nextLevelXp: next?.minXp ?? null,
      };
    });

    // Sort by XP descending, then name ascending for ties
    return entries
      .filter((e) => e.xp > 0 || true) // include all users (even 0 XP)
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  },
};
