import { supabase } from '@/lib/supabase';

export type BadgeRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type BadgeState = 'locked' | 'almost' | 'unlocked';

export interface BadgeDefinition {
  id: string; // uuid from DB or hardcoded
  name: string;
  description: string;
  requirement: string;
  icon: string;
  rarity: BadgeRarity;
  xp: number;
  threshold: number;
  metric: keyof UserBadgeProgress;
  almostThreshold?: number;
  cta?: { label: string; to: string };
  badge_key?: string;
}

export interface UserBadgeProgress {
  episodeCount: number;
  approvedCount: number;
  submittedCount: number;
  bookingCount: number;
  scheduledCount: number;
  audioUploadCount: number;
  firstEpisodeCreatedAt: string | null;
  firstBookingAt: string | null;
  firstApprovalAt: string | null;
  monthlyApproved: number;
  consecutiveWeeks: number;
}

export interface ComputedBadge extends BadgeDefinition {
  state: BadgeState;
  current: number;
  unlockedAt: string | null;
}

// ─── Hardcoded Fallbacks ───────────────────────────────────────────────────

export const FALLBACK_BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'mic-drop', name: 'Mic Drop', description: 'You stepped up to the mic for the first time.', requirement: 'Create your first show', icon: 'mic', rarity: 'COMMON', xp: 50, threshold: 1, metric: 'episodeCount' },
  { id: 'slot-locked', name: 'Slot Locked', description: 'You claimed your place in the broadcast schedule.', requirement: 'Book your first studio slot', icon: 'clock', rarity: 'COMMON', xp: 50, threshold: 1, metric: 'bookingCount' },
  { id: 'sound-check', name: 'Sound Check', description: 'Your audio is in the system. Ready to roll.', requirement: 'Upload your first audio file', icon: 'waveform', rarity: 'COMMON', xp: 75, threshold: 1, metric: 'audioUploadCount' },
  { id: 'scripted', name: 'Scripted', description: 'Your show is ready for review.', requirement: 'Submit an episode for QC', icon: 'script', rarity: 'COMMON', xp: 50, threshold: 1, metric: 'submittedCount' },
  { id: 'green-light', name: 'Green Light', description: 'Quality checked and broadcast-ready.', requirement: 'Get your first episode approved', icon: 'signal', rarity: 'UNCOMMON', xp: 100, threshold: 1, metric: 'approvedCount' },
  { id: 'tuned-in', name: 'Tuned In', description: 'Five shows deep and still broadcasting.', requirement: 'Create 5 episodes', icon: 'tuner', rarity: 'UNCOMMON', xp: 100, threshold: 5, metric: 'episodeCount', almostThreshold: 4 },
  { id: 'first-broadcast', name: 'First Broadcast', description: 'Your voice hit the airwaves.', requirement: 'Have an episode scheduled for broadcast', icon: 'onair', rarity: 'UNCOMMON', xp: 100, threshold: 1, metric: 'scheduledCount' },
  { id: 'voice-rising', name: 'Voice Rising', description: 'Your quality is consistently broadcast-ready.', requirement: 'Get 5 episodes approved', icon: 'rising', rarity: 'UNCOMMON', xp: 150, threshold: 5, metric: 'approvedCount', almostThreshold: 4 },
  { id: 'first-frequency', name: 'First Frequency', description: 'Double digits. You found your frequency.', requirement: 'Create 10 episodes', icon: 'frequency', rarity: 'RARE', xp: 150, threshold: 10, metric: 'episodeCount', almostThreshold: 8 },
  { id: 'on-a-roll', name: 'On A Roll', description: 'Three approved shows this month — you\'re on fire.', requirement: 'Get 3 episodes approved in one month', icon: 'fire', rarity: 'RARE', xp: 150, threshold: 3, metric: 'monthlyApproved', almostThreshold: 2 },
  { id: 'frequency-familiar', name: 'Frequency Familiar', description: 'The studio knows your name.', requirement: 'Book 10 studio slots', icon: 'clock', rarity: 'RARE', xp: 150, threshold: 10, metric: 'bookingCount', almostThreshold: 8 },
  { id: 'request-line', name: 'Request Line', description: 'You keep submitting and the station keeps listening.', requirement: 'Submit 5 episodes for QC', icon: 'signal', rarity: 'RARE', xp: 200, threshold: 5, metric: 'submittedCount', almostThreshold: 4 },
  { id: 'station-voice', name: 'Station Voice', description: 'Fifteen episodes. You\'re part of the station now.', requirement: 'Create 15 episodes', icon: 'mic', rarity: 'RARE', xp: 200, threshold: 15, metric: 'episodeCount', almostThreshold: 13 },
  { id: 'campus-shout', name: 'Campus Shout', description: 'Twenty shows — VIT Community Radio is louder because of you.', requirement: 'Create 20 episodes', icon: 'broadcast', rarity: 'EPIC', xp: 200, threshold: 20, metric: 'episodeCount', almostThreshold: 18 },
  { id: 'frequency-hunter', name: 'Frequency Hunter', description: 'Ten approved episodes. You hunt the perfect signal.', requirement: 'Get 10 episodes approved', icon: 'frequency', rarity: 'EPIC', xp: 250, threshold: 10, metric: 'approvedCount', almostThreshold: 8 },
  { id: 'locked-to-the-frequency', name: 'Locked To The Frequency', description: 'Twenty bookings. The studio slot is basically yours.', requirement: 'Book 20 studio slots', icon: 'lock', rarity: 'EPIC', xp: 200, threshold: 20, metric: 'bookingCount', almostThreshold: 18 },
  { id: 'voice-of-vit', name: 'Voice Of VIT', description: 'Twenty-five shows. You ARE the voice of VIT.', requirement: 'Create 25 episodes', icon: 'mic', rarity: 'EPIC', xp: 250, threshold: 25, metric: 'episodeCount', almostThreshold: 23 },
  { id: 'radio-devotion', name: 'Radio Devotion', description: 'Thirty bookings. This isn\'t a hobby — it\'s a calling.', requirement: 'Book 30 studio slots', icon: 'broadcast', rarity: 'LEGENDARY', xp: 300, threshold: 30, metric: 'bookingCount', almostThreshold: 27 },
  { id: 'radio-legend', name: 'Radio Legend', description: 'Fifty episodes. Your legacy is woven into VIT Community Radio.', requirement: 'Create 50 episodes', icon: 'legend', rarity: 'LEGENDARY', xp: 500, threshold: 50, metric: 'episodeCount', almostThreshold: 45 },
];

export const FALLBACK_XP_LEVELS = [
  { level: 1, title: 'Radio Newcomer', minXp: 0 },
  { level: 2, title: 'Signal Seeker', minXp: 100 },
  { level: 3, title: 'Frequency Finder', minXp: 250 },
  { level: 4, title: 'Radio Regular', minXp: 500 },
  { level: 5, title: 'Rising Voice', minXp: 850 },
  { level: 6, title: 'Broadcast Veteran', minXp: 1300 },
  { level: 7, title: 'Station Pillar', minXp: 1900 },
  { level: 8, title: 'Radio Legend', minXp: 2700 },
];

// For backwards compatibility before we refactor all callers to async
export const BADGE_DEFINITIONS = FALLBACK_BADGE_DEFINITIONS;
export const XP_LEVELS = FALLBACK_XP_LEVELS;

export const RARITY_LABEL: Record<BadgeRarity, string> = {
  COMMON: 'Common',
  UNCOMMON: 'Uncommon',
  RARE: 'Rare',
  EPIC: 'Epic',
  LEGENDARY: 'Legendary',
};

// ─── Data Access ─────────────────────────────────────────────────────────────

export const badgeService = {
  async getBadgeDefinitions(): Promise<BadgeDefinition[]> {
    const { data, error } = await supabase
      .from('gamification_badges')
      .select('*')
      .eq('active', true)
      .order('xp', { ascending: true });

    if (error) {
      // 42P01 = undefined_table. Fallback only if the table doesn't exist locally.
      if (error.code === '42P01') {
        return FALLBACK_BADGE_DEFINITIONS;
      }
      console.error('Error fetching badges:', error);
      return [];
    }
    
    if (!data) return [];
    
    return data.map(row => ({
      id: row.id,
      badge_key: row.badge_key,
      name: row.name,
      description: row.description,
      requirement: row.requirement,
      icon: row.icon,
      rarity: row.rarity,
      xp: row.xp,
      threshold: row.threshold,
      metric: row.metric as keyof UserBadgeProgress,
      almostThreshold: row.almost_threshold ?? undefined,
    }));
  },

  async getLevels(): Promise<{ level: number; title: string; minXp: number }[]> {
    const { data, error } = await supabase
      .from('gamification_levels')
      .select('*')
      .order('level', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return FALLBACK_XP_LEVELS;
      }
      console.error('Error fetching levels:', error);
      return FALLBACK_XP_LEVELS; // Levels are critical to prevent crashes, but ideally handle empty state gracefully
    }
    if (!data || data.length === 0) return FALLBACK_XP_LEVELS;
    return data.map(r => ({ level: r.level, title: r.title, minXp: r.min_xp }));
  },

  async getLevelFromXpAsync(xp: number) {
    const levels = await this.getLevels();
    let current = levels[0];
    for (const lvl of levels) {
      if (xp >= lvl.minXp) current = lvl;
      else break;
    }
    const idx = levels.indexOf(current);
    const next = levels[idx + 1] ?? null;
    const progressInLevel = xp - current.minXp;
    const rangeInLevel = next ? next.minXp - current.minXp : 1;
    return {
      level: current,
      next,
      progressInLevel,
      rangeInLevel,
      pct: Math.min(100, Math.round((progressInLevel / rangeInLevel) * 100)),
    };
  },

  async getUserProgress(userId: string): Promise<UserBadgeProgress> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      episodesResult,
      approvedResult,
      submittedResult,
      bookingsResult,
      scheduledResult,
      audioResult,
      monthlyApprovedResult,
    ] = await Promise.allSettled([
      supabase.from('episodes').select('id, created_at', { count: 'exact' }).eq('created_by', userId),
      supabase.from('episodes').select('id, reviewed_at', { count: 'exact' }).eq('created_by', userId).eq('status', 'APPROVED'),
      supabase.from('episodes').select('id, submitted_at', { count: 'exact' }).eq('created_by', userId).not('submitted_at', 'is', null),
      supabase.from('studio_bookings').select('id, created_at', { count: 'exact' }).eq('rj_id', userId).neq('status', 'CANCELLED'),
      supabase.from('schedules').select('id', { count: 'exact' }).eq('created_by', userId),
      supabase.from('episodes').select('id', { count: 'exact' }).eq('created_by', userId).not('audio_file_id', 'is', null),
      supabase.from('episodes').select('id', { count: 'exact' }).eq('created_by', userId).eq('status', 'APPROVED').gte('reviewed_at', thirtyDaysAgo),
    ]);

    const episodes = episodesResult.status === 'fulfilled' ? episodesResult.value : null;
    const approved = approvedResult.status === 'fulfilled' ? approvedResult.value : null;
    const submitted = submittedResult.status === 'fulfilled' ? submittedResult.value : null;
    const bookings = bookingsResult.status === 'fulfilled' ? bookingsResult.value : null;
    const scheduled = scheduledResult.status === 'fulfilled' ? scheduledResult.value : null;
    const audio = audioResult.status === 'fulfilled' ? audioResult.value : null;
    const monthly = monthlyApprovedResult.status === 'fulfilled' ? monthlyApprovedResult.value : null;

    const episodeRows = episodes?.data ?? [];
    const bookingRows = bookings?.data ?? [];
    const approvedRows = approved?.data ?? [];

    const consecutiveWeeks = computeConsecutiveWeeks([
      ...episodeRows.map((e) => e.created_at),
      ...bookingRows.map((b) => b.created_at),
    ]);

    return {
      episodeCount: episodes?.count ?? 0,
      approvedCount: approved?.count ?? 0,
      submittedCount: submitted?.count ?? 0,
      bookingCount: bookings?.count ?? 0,
      scheduledCount: scheduled?.count ?? 0,
      audioUploadCount: audio?.count ?? 0,
      monthlyApproved: monthly?.count ?? 0,
      consecutiveWeeks,
      firstEpisodeCreatedAt: episodeRows[0]?.created_at ?? null,
      firstBookingAt: bookingRows[0]?.created_at ?? null,
      firstApprovalAt: approvedRows[0]?.reviewed_at ?? null,
    };
  },

  async computeBadgesAsync(progress: UserBadgeProgress): Promise<ComputedBadge[]> {
    const definitions = await this.getBadgeDefinitions();
    return definitions.map((def) => {
      const current = progress[def.metric] as number;
      const almostAt = def.almostThreshold ?? Math.max(1, Math.floor(def.threshold * 0.8));

      let state: BadgeState = 'locked';
      if (current >= def.threshold) state = 'unlocked';
      else if (current >= almostAt) state = 'almost';

      let unlockedAt: string | null = null;
      if (state === 'unlocked') {
        if (def.metric === 'episodeCount') unlockedAt = progress.firstEpisodeCreatedAt;
        if (def.metric === 'approvedCount') unlockedAt = progress.firstApprovalAt;
        if (def.metric === 'bookingCount') unlockedAt = progress.firstBookingAt;
      }
      return { ...def, state, current, unlockedAt };
    });
  },

  // Maintain backward compatibility for components that still expect synchronous computation using fallback rules
  computeBadges(progress: UserBadgeProgress): ComputedBadge[] {
    return FALLBACK_BADGE_DEFINITIONS.map((def) => {
      const current = progress[def.metric] as number;
      const almostAt = def.almostThreshold ?? Math.max(1, Math.floor(def.threshold * 0.8));
      let state: BadgeState = 'locked';
      if (current >= def.threshold) state = 'unlocked';
      else if (current >= almostAt) state = 'almost';
      const unlockedAt: string | null = null;
      return { ...def, state, current, unlockedAt };
    });
  },
};

export function getLevelFromXp(xp: number) {
  let current = FALLBACK_XP_LEVELS[0];
  for (const lvl of FALLBACK_XP_LEVELS) {
    if (xp >= lvl.minXp) current = lvl;
    else break;
  }
  const idx = FALLBACK_XP_LEVELS.indexOf(current);
  const next = FALLBACK_XP_LEVELS[idx + 1] ?? null;
  const progressInLevel = xp - current.minXp;
  const rangeInLevel = next ? next.minXp - current.minXp : 1;
  return {
    level: current,
    next,
    progressInLevel,
    rangeInLevel,
    pct: Math.min(100, Math.round((progressInLevel / rangeInLevel) * 100)),
  };
}

function computeConsecutiveWeeks(dates: string[]): number {
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
}
