import type { BadgeRarity } from '@/services/badgeService';

export const RARITY_COLORS: Record<BadgeRarity, string> = {
  COMMON:    '#6b7280',
  UNCOMMON:  '#10b981',
  RARE:      '#3b82f6',
  EPIC:      '#8b5cf6',
  LEGENDARY: '#f59e0b',
};

export const RARITY_GLOW: Record<BadgeRarity, string> = {
  COMMON:    'rgba(107, 114, 128, 0.35)',
  UNCOMMON:  'rgba(16, 185, 129, 0.35)',
  RARE:      'rgba(59, 130, 246, 0.35)',
  EPIC:      'rgba(139, 92, 246, 0.35)',
  LEGENDARY: 'rgba(245, 158, 11, 0.4)',
};
