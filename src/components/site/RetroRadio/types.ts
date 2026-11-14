import type { PublicApprovedEpisodeRow, PublicNowPlayingRow } from '@/types/database';

export interface RadioItem {
  id: string;
  isLive: boolean;
  frequency: number; // e.g. 90.8, 92.4, 95.2...
  category: string;
  title: string;
  host: string;
  description: string;
  highlights: string[];
  date: string;
  isNew?: boolean;
  durationSeconds?: number | null;
  episode?: PublicApprovedEpisodeRow;
  nowPlaying?: PublicNowPlayingRow;
  artworkUrl?: string | null;
}

export interface RadioVisualizerData {
  levels: number[]; // 0 to 1 values for EQ bars
  peak: number;
}

