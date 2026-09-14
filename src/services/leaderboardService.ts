import { supabase } from '@/lib/supabase';
import { 
  badgeService, 
  type ComputedBadge
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
  streak: number;
  badges: ComputedBadge[];
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
      supabase.from('episodes').select('created_by, status, submitted_at, created_at, reviewed_at').not('created_by', 'is', null),
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
    const userEpisodes: Record<string, { total: number; approved: number; submitted: number; firstCreated: string | null; firstApproved: string | null; dates: string[] }> = {};
    const userBookings: Record<string, { total: number; firstCreated: string | null; dates: string[] }> = {};

    for (const ep of episodeRows) {
      const uid = ep.created_by;
      if (!uid) continue;
      if (!userEpisodes[uid]) userEpisodes[uid] = { total: 0, approved: 0, submitted: 0, firstCreated: null, firstApproved: null, dates: [] };
      userEpisodes[uid].total++;
      if (ep.created_at) {
        userEpisodes[uid].dates.push(ep.created_at);
        if (!userEpisodes[uid].firstCreated || new Date(ep.created_at) < new Date(userEpisodes[uid].firstCreated!)) {
          userEpisodes[uid].firstCreated = ep.created_at;
        }
      }
      if (ep.status === 'APPROVED') {
        userEpisodes[uid].approved++;
        if (ep.reviewed_at && (!userEpisodes[uid].firstApproved || new Date(ep.reviewed_at) < new Date(userEpisodes[uid].firstApproved!))) {
          userEpisodes[uid].firstApproved = ep.reviewed_at;
        }
      }
      if (ep.submitted_at) userEpisodes[uid].submitted++;
    }

    for (const bk of bookingRows) {
      const uid = bk.rj_id;
      if (!uid) continue;
      if (since && bk.created_at < since) continue;
      if (!userBookings[uid]) userBookings[uid] = { total: 0, firstCreated: null, dates: [] };
      userBookings[uid].total++;
      if (bk.created_at) {
        userBookings[uid].dates.push(bk.created_at);
        if (!userBookings[uid].firstCreated || new Date(bk.created_at) < new Date(userBookings[uid].firstCreated!)) {
          userBookings[uid].firstCreated = bk.created_at;
        }
      }
    }

    // Fetch dynamic levels
    const levels = await badgeService.getLevels();

    // Helper for streaks
    const computeConsecutiveWeeks = (dates: string[]): number => {
      if (dates.length === 0) return 0;
      const weeks = new Set(
        dates.map((d) => {
          const date = new Date(d);
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          return startOfWeek.toISOString().split('T')[0];
        }),
      );
      const sorted = Array.from(weeks).sort().reverse();
      if (sorted.length === 0) return 0;
      let streak = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diff = (prev.getTime() - curr.getTime()) / (7 * 24 * 60 * 60 * 1000);
        if (Math.abs(diff - 1) < 0.1) streak++;
        else break;
      }
      return streak;
    };

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = profiles.map((p) => {
      const ep = userEpisodes[p.id] ?? { total: 0, approved: 0, submitted: 0, firstCreated: null, firstApproved: null, dates: [] };
      const bk = userBookings[p.id] ?? { total: 0, firstCreated: null, dates: [] };

      // XP from activities
      const activityXp =
        ep.total * (xpRules['EPISODE_CREATE'] || 0) +
        ep.approved * (xpRules['EPISODE_QC_APPROVE'] || 0) +
        ep.submitted * (xpRules['EPISODE_QC_SUBMIT'] || 0) +
        bk.total * (xpRules['STUDIO_BOOKING'] || 0);

      // Compute ComputedBadge[] 
      const computedBadges = badgeDefinitions.map((def) => {
        let current = 0;
        let unlockedAt: string | null = null;
        if (def.metric === 'episodeCount') { current = ep.total; unlockedAt = ep.firstCreated; }
        else if (def.metric === 'approvedCount') { current = ep.approved; unlockedAt = ep.firstApproved; }
        else if (def.metric === 'submittedCount') { current = ep.submitted; unlockedAt = ep.firstCreated; }
        else if (def.metric === 'bookingCount') { current = bk.total; unlockedAt = bk.firstCreated; }
        
        const almostAt = def.almostThreshold ?? Math.max(1, Math.floor(def.threshold * 0.8));
        let state: 'locked' | 'almost' | 'unlocked' = 'locked';
        if (current >= def.threshold) state = 'unlocked';
        else if (current >= almostAt) state = 'almost';
        
        return { ...def, state, current, unlockedAt: state === 'unlocked' ? unlockedAt : null };
      });

      const badgeCount = computedBadges.filter(b => b.state === 'unlocked').length;
      const badgeXpTotal = computedBadges.filter(b => b.state === 'unlocked').reduce((sum, b) => sum + b.xp, 0);

      const streak = computeConsecutiveWeeks([...ep.dates, ...bk.dates]);

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
        bookingCount: bk.total,
        level: current.level,
        levelTitle: current.title,
        levelPct,
        nextLevelXp: next?.minXp ?? null,
        streak,
        badges: computedBadges as any,
      };
    });

    // Sort by XP descending, then name ascending for ties
    return entries
      .filter((e) => e.xp > 0 || true) // include all users (even 0 XP)
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  },
};
