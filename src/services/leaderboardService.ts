import { supabase } from '@/lib/supabase';
import { 
  badgeService, 
  type ComputedBadge
} from '@/services/badgeService';

export type LeaderboardFilter = 'all' | 'month' | 'week';

export interface LeaderboardEntry {
  userId: string;
  name: string;
  xp: number; // ALWAYS Authoritative All-Time XP
  periodXp: number; // XP earned during the specified filter period (used for sorting)
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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch config and overrides concurrently with profiles and activity
    const [
      { data: profiles },
      { data: episodesRes },
      { data: bookingsRes },
      { data: schedulesRes },
      { data: userBadgesRes },
      { data: xpRulesData, error: xpRulesError },
      badgeDefinitions,
      { data: overridesData }
    ] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('active', true).neq('role', 'ADMIN'),
      supabase.from('episodes').select('id, created_by, status, submitted_at, created_at, reviewed_at, audio_file_id').not('created_by', 'is', null),
      supabase.from('studio_bookings').select('id, rj_id, created_at').neq('status', 'CANCELLED').not('rj_id', 'is', null),
      supabase.from('schedules').select('id, created_by').not('created_by', 'is', null),
      supabase.from('user_badges').select('user_id, badge_key, earned_at'),
      supabase.from('gamification_xp_rules').select('action, xp_reward').eq('active', true),
      badgeService.getBadgeDefinitions(),
      supabase.from('user_gamification_adjustments').select('user_id, xp_adjustment, created_at')
    ]);

    if (!profiles) return [];

    const episodeRows = episodesRes ?? [];
    const bookingRows = bookingsRes ?? [];
    const scheduleRows = schedulesRes ?? [];
    const userBadgeRows = userBadgesRes ?? [];
    const overrideRows = overridesData ?? [];
    
    // Process XP Rules
    const xpRules: Record<string, number> = {};
    if (xpRulesError) {
      console.error('Error fetching xp rules:', xpRulesError);
    } else if (xpRulesData) {
      xpRulesData.forEach(r => { xpRules[r.action] = r.xp_reward; });
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
      const uid = p.id;
      
      // All-time stats for Badges and Level
      let epTotal = 0, epApproved = 0, epSubmitted = 0, epAudio = 0, monthlyApproved = 0;
      let firstEpCreated: string | null = null;
      let firstEpApproved: string | null = null;
      const epDates: string[] = [];
      
      // Period stats for XP
      let periodEpTotal = 0, periodEpApproved = 0, periodEpSubmitted = 0;

      for (const ep of episodeRows) {
        if (ep.created_by !== uid) continue;
        
        epTotal++;
        if (ep.created_at) {
          epDates.push(ep.created_at);
          if (!firstEpCreated || ep.created_at < firstEpCreated) firstEpCreated = ep.created_at;
          if (!since || ep.created_at >= since) periodEpTotal++;
        }
        
        if (ep.status === 'APPROVED') {
          epApproved++;
          if (ep.reviewed_at) {
            if (!firstEpApproved || ep.reviewed_at < firstEpApproved) firstEpApproved = ep.reviewed_at;
            if (ep.reviewed_at >= thirtyDaysAgo) monthlyApproved++;
            if (!since || ep.reviewed_at >= since) periodEpApproved++;
          }
        }
        
        if (ep.submitted_at) {
          epSubmitted++;
          if (!since || ep.submitted_at >= since) periodEpSubmitted++;
        }
        
        if (ep.audio_file_id) {
          epAudio++;
        }
      }

      let bkTotal = 0, periodBkTotal = 0;
      let firstBkCreated: string | null = null;
      const bkDates: string[] = [];

      for (const bk of bookingRows) {
        if (bk.rj_id !== uid) continue;
        bkTotal++;
        if (bk.created_at) {
          bkDates.push(bk.created_at);
          if (!firstBkCreated || bk.created_at < firstBkCreated) firstBkCreated = bk.created_at;
          if (!since || bk.created_at >= since) periodBkTotal++;
        }
      }

      let schTotal = 0;
      for (const sch of scheduleRows) {
        if (sch.created_by !== uid) continue;
        schTotal++;
      }

      const explicitBadges = userBadgeRows.filter(b => b.user_id === uid);
      const streak = computeConsecutiveWeeks([...epDates, ...bkDates]);

      // Calculate Badges (All-Time)
      const computedBadges = badgeDefinitions.map((def) => {
        let current = 0;
        let unlockedAt: string | null = null;
        
        if (def.metric === 'episodeCount') { current = epTotal; unlockedAt = firstEpCreated; }
        else if (def.metric === 'approvedCount') { current = epApproved; unlockedAt = firstEpApproved; }
        else if (def.metric === 'submittedCount') { current = epSubmitted; unlockedAt = firstEpCreated; }
        else if (def.metric === 'bookingCount') { current = bkTotal; unlockedAt = firstBkCreated; }
        else if (def.metric === 'audioUploadCount') { current = epAudio; unlockedAt = firstEpCreated; }
        else if (def.metric === 'scheduledCount') { current = schTotal; unlockedAt = firstEpCreated; }
        else if (def.metric === 'monthlyApproved') { current = monthlyApproved; unlockedAt = new Date().toISOString(); }
        else if (def.metric === 'consecutiveWeeks') { current = streak; unlockedAt = new Date().toISOString(); }

        const explicit = explicitBadges.find((b) => b.badge_key === def.badge_key || b.badge_key === def.id);
        
        const almostAt = def.almostThreshold ?? Math.max(1, Math.floor(def.threshold * 0.8));
        let state: 'locked' | 'almost' | 'unlocked' = 'locked';
        
        if (explicit) {
          state = 'unlocked';
          unlockedAt = explicit.earned_at;
          current = Math.max(current, def.threshold);
        } else {
          if (current >= def.threshold) state = 'unlocked';
          else if (current >= almostAt) state = 'almost';
        }
        
        return { ...def, state, current, unlockedAt: state === 'unlocked' ? unlockedAt : null };
      });

      const badgeCount = computedBadges.filter(b => b.state === 'unlocked').length;

      // All-Time XP Calculation
      const allTimeActivityXp =
        epTotal * (xpRules['EPISODE_CREATE'] || 0) +
        epApproved * (xpRules['EPISODE_QC_APPROVE'] || 0) +
        epSubmitted * (xpRules['EPISODE_QC_SUBMIT'] || 0) +
        bkTotal * (xpRules['STUDIO_BOOKING'] || 0);

      const allTimeBadgeXp = computedBadges
        .filter(b => b.state === 'unlocked')
        .reduce((sum, b) => sum + b.xp, 0);

      const allTimeManualAdjustment = overrideRows
        .filter(o => o.user_id === uid)
        .reduce((sum, o) => sum + o.xp_adjustment, 0);

      const allTimeTotalXp = Math.max(0, allTimeActivityXp + allTimeBadgeXp + allTimeManualAdjustment);

      // Period XP Calculation
      const periodActivityXp =
        periodEpTotal * (xpRules['EPISODE_CREATE'] || 0) +
        periodEpApproved * (xpRules['EPISODE_QC_APPROVE'] || 0) +
        periodEpSubmitted * (xpRules['EPISODE_QC_SUBMIT'] || 0) +
        periodBkTotal * (xpRules['STUDIO_BOOKING'] || 0);

      const periodBadgeXp = computedBadges
        .filter(b => b.state === 'unlocked' && (!since || (b.unlockedAt && b.unlockedAt >= since)))
        .reduce((sum, b) => sum + b.xp, 0);

      const periodManualAdjustment = overrideRows
        .filter(o => o.user_id === uid && (!since || (o.created_at && o.created_at >= since)))
        .reduce((sum, o) => sum + o.xp_adjustment, 0);

      const periodTotalXp = Math.max(0, periodActivityXp + periodBadgeXp + periodManualAdjustment);
      
      // Calculate level based on ALL-TIME XP
      let currentLevel = levels[0];
      for (const lvl of levels) {
        if (allTimeTotalXp >= lvl.minXp) currentLevel = lvl;
        else break;
      }
      const idx = levels.indexOf(currentLevel);
      const nextLevel = levels[idx + 1] ?? null;
      const progressInLevel = allTimeTotalXp - currentLevel.minXp;
      const rangeInLevel = nextLevel ? nextLevel.minXp - currentLevel.minXp : 1;
      const levelPct = Math.min(100, Math.round((progressInLevel / rangeInLevel) * 100));

      return {
        userId: p.id,
        name: p.full_name,
        xp: allTimeTotalXp, // ALWAYS All-Time XP for source-of-truth consistency
        periodXp: periodTotalXp, // Period XP strictly for Leaderboard sorting
        badgeCount,
        episodeCount: epTotal, // Keep all-time counts for display
        approvedCount: epApproved,
        bookingCount: bkTotal,
        level: currentLevel.level,
        levelTitle: currentLevel.title,
        levelPct,
        nextLevelXp: nextLevel?.minXp ?? null,
        streak,
        badges: computedBadges as ComputedBadge[],
      };
    });

    // Sort by Period XP descending for the current filter, then name ascending for ties
    return entries
      .filter((e) => e.xp > 0 || true) // include all users (even 0 XP)
      .sort((a, b) => b.periodXp - a.periodXp || a.name.localeCompare(b.name));
  },
};
