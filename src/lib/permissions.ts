/**
 * UI-side mirror of the database rules.
 *
 * This file decides what to DRAW. It decides nothing about what is ALLOWED --
 * that is settled by RLS policies and guard triggers in supabase/migrations.
 * If these two ever disagree, the database wins and the user sees a clear
 * permission error instead of a broken screen.
 */
import type { EpisodeRow, EpisodeStatus, UserRole } from '@/types/database';

export const EDITABLE_EPISODE_STATUSES: EpisodeStatus[] = ['DRAFT', 'REJECTED'];

export const can = {
  manageProgram: (role: UserRole): boolean => role === 'ADMIN' || role === 'PRODUCER',

  /** Book the studio for oneself. Admins book on anyone's behalf. */
  bookStudio: (role: UserRole): boolean =>
    role === 'ADMIN' || role === 'PRODUCER' || role === 'RJ',

  /** Waive the 24-hour rule. Enforced again by app.enforce_booking_window(). */
  overrideBookingWindow: (role: UserRole): boolean => role === 'ADMIN',

  /** Be assignable as an editor on a booking. */
  editAudio: (role: UserRole): boolean =>
    role === 'EDITOR' || role === 'PRODUCER' || role === 'ADMIN',

  approveScript: (role: UserRole): boolean =>
    role === 'SECTION_HEAD' || role === 'ADMIN',

  createEpisode: (role: UserRole): boolean =>
    role === 'ADMIN' || role === 'PRODUCER' || role === 'RJ',

  editEpisode: (role: UserRole, episode: Pick<EpisodeRow,
    'status' | 'created_by' | 'assigned_rj'>, userId: string): boolean => {
    if (!EDITABLE_EPISODE_STATUSES.includes(episode.status)) return false;
    if (role === 'ADMIN' || role === 'PRODUCER') return true;
    if (role === 'RJ') return episode.created_by === userId || episode.assigned_rj === userId;
    return false;
  },

  submitEpisode: (role: UserRole, episode: Pick<EpisodeRow,
    'status' | 'created_by' | 'assigned_rj'>, userId: string): boolean =>
    can.editEpisode(role, episode, userId),

  reviewQC: (role: UserRole): boolean => role === 'QC' || role === 'ADMIN',

  schedule: (role: UserRole): boolean => role === 'ADMIN' || role === 'PRODUCER',

  goLive: (role: UserRole): boolean =>
    role === 'ADMIN' || role === 'PRODUCER' || role === 'RJ',

  archiveEpisode: (role: UserRole): boolean => role === 'ADMIN' || role === 'PRODUCER',

  manageUsers: (role: UserRole): boolean => role === 'ADMIN',

  viewAudioLibrary: (role: UserRole): boolean => role === 'ADMIN' || role === 'PRODUCER',

  viewFullActivity: (role: UserRole): boolean => role === 'ADMIN' || role === 'PRODUCER',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  PRODUCER: 'Producer',
  RJ: 'Radio Jockey',
  QC: 'Quality Control',
  EDITOR: 'Audio Editor',
  SECTION_HEAD: 'Section Head / Faculty',
};

export const ROLE_SUMMARY: Record<UserRole, string> = {
  ADMIN: 'Full access to content, scheduling, users and settings.',
  PRODUCER: 'Manages programmes, episodes, audio and the schedule.',
  RJ: 'Books the studio, records and uploads shows, and goes on air.',
  QC: 'Reviews finished audio and approves or rejects it for broadcast.',
  EDITOR: 'Cuts and returns the audio for shows assigned to them.',
  SECTION_HEAD: 'Approves show scripts before recording.',
};
