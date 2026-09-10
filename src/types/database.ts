/**
 * Database types.
 *
 * Hand-maintained to mirror supabase/migrations exactly, in the same shape that
 * `supabase gen types typescript` produces, so it can be swapped for generated
 * output later without touching the services.
 *
 * IMPORTANT: every Row/View type below must be a `type` alias, never an
 * `interface`. supabase-js requires each Row to satisfy `Record<string, unknown>`;
 * an interface has no implicit index signature and silently fails that check,
 * which makes the WHOLE Database type stop matching GenericSchema. The symptom
 * is not an error here -- it is every `.insert()` and `.update()` in the service
 * layer collapsing to `never`, with the errors reported in those files instead.
 *
 * The `Relationships` entries are what let PostgREST embedded selects
 * (`program:programs!episodes_program_id_fkey (...)`) type-check.
 */

export type UserRole = 'ADMIN' | 'PRODUCER' | 'RJ' | 'QC' | 'EDITOR' | 'SECTION_HEAD';

export type EpisodeStatus =
  | 'DRAFT'
  | 'PENDING_QC'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED';

export type QcDecision = 'APPROVED' | 'REJECTED';

export type ScheduleStatus = 'SCHEDULED' | 'ON_AIR' | 'COMPLETED' | 'CANCELLED';

export type BroadcastStatus = 'OFFLINE' | 'ON_AIR';

export type EntityType =
  | 'PROGRAM'
  | 'EPISODE'
  | 'AUDIO_FILE'
  | 'SCHEDULE'
  | 'BROADCAST'
  | 'PROFILE';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type BookingOrigin = 'RJ' | 'ADMIN_OVERRIDE';
export type ShowLanguage = 'TAMIL' | 'ENGLISH' | 'HINDI' | 'TELUGU' | 'MALAYALAM';
export type ScriptApproval = 'YES' | 'NO' | 'PENDING';

export type StudioBookingRow = {
  id: string;
  /** Allocated by the database (VCR-2026-000123). Never generated client-side. */
  reference: string;
  rj_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  show_name: string;
  language: ShowLanguage;
  script_status: ScriptApproval;
  script_approver: string | null;
  self_edit: boolean;
  editor_id: string | null;
  status: BookingStatus;
  origin: BookingOrigin;
  override_reason: string | null;
  notes: string | null;
  episode_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SlotKind =
  | 'ANNOUNCEMENT'
  | 'SEGMENT'
  | 'ROTATING_BLOCK'
  | 'REBROADCAST'
  | 'FEATURE';

/** A row of the Fixed Point Chart (migration 09). Times are station-local. */
export type StationSlotRow = {
  id: string;
  title: string;
  kind: SlotKind;
  start_time: string;
  end_time: string;
  days: number[];
  program_id: string | null;
  notes: string | null;
  effective_from: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PublicChartRow = {
  id: string;
  title: string;
  kind: SlotKind;
  start_time: string;
  end_time: string;
  days: number[];
  notes: string | null;
  effective_from: string;
  program_name: string | null;
  program_category: string | null;
}

/** Occupancy only. The public view carries nothing else -- see migration 11. */
export type PublicStudioSlotRow = {
  booking_date: string;
  start_time: string;
  end_time: string;
}

export type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  active: boolean;
  /** When an admin first activated the account. NULL = still awaiting approval. */
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ProgramRow = {
  id: string;
  name: string;
  description: string | null;
  host_name: string | null;
  category: string;
  artwork_url: string | null;
  default_duration_minutes: number;
  requires_audio: boolean;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EpisodeRow = {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  episode_number: number | null;
  host_name: string | null;
  assigned_rj: string | null;
  audio_file_id: string | null;
  duration_seconds: number | null;
  status: EpisodeStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AudioFileRow = {
  id: string;
  episode_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  duration_seconds: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export type QcReviewRow = {
  id: string;
  episode_id: string;
  reviewer_id: string | null;
  decision: QcDecision;
  comment: string | null;
  created_at: string;
}

export type ScheduleRow = {
  id: string;
  program_id: string;
  episode_id: string | null;
  start_time: string;
  end_time: string;
  status: ScheduleStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BroadcastStateRow = {
  id: boolean;
  status: BroadcastStatus;
  current_schedule_id: string | null;
  started_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type ActivityLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: EntityType;
  entity_id: string | null;
  metadata: Record<string, Json>;
  created_at: string;
}

export type ScheduleDetailsRow = {
  id: string;
  program_id: string;
  episode_id: string | null;
  start_time: string;
  end_time: string;
  status: ScheduleStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  program_name: string;
  program_category: string;
  episode_title: string | null;
  episode_number: number | null;
  host_name: string | null;
  audio_storage_path: string | null;
  audio_duration_seconds: number | null;
}

export type CurrentBroadcastRow = {
  broadcast_status: BroadcastStatus;
  started_at: string | null;
  schedule_id: string | null;
  program_id: string | null;
  episode_id: string | null;
  program_name: string | null;
  episode_title: string | null;
  host_name: string | null;
  start_time: string | null;
  end_time: string | null;
  schedule_status: ScheduleStatus | null;
  audio_storage_path: string | null;
}

/** Curated, anonymous-readable projection for the public homepage. */
export type PublicNowPlayingRow = {
  broadcast_status: BroadcastStatus;
  started_at: string | null;
  program_name: string | null;
  episode_title: string | null;
  host_name: string | null;
  start_time: string | null;
  end_time: string | null;
};

export type PublicScheduleRow = {
  id: string;
  program_name: string;
  episode_title: string | null;
  host_name: string | null;
  start_time: string;
  end_time: string;
  status: ScheduleStatus;
};

export type PublicProgramRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  host_name: string | null;
  artwork_url: string | null;
  aired_episode_count: number;
  last_aired_at: string | null;
};

export type PublicEpisodeRow = {
  id: string;
  title: string;
  description: string | null;
  episode_number: number | null;
  host_name: string | null;
  program_id: string;
  program_name: string;
  program_category: string;
  duration_seconds: number | null;
  aired_at: string;
};

/** Columns the database fills in itself are optional on insert. */
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;

/** Tables with no client write policy still need object types here. */
type NoWrites = Record<string, never>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Insertable<ProfileRow, 'id' | 'full_name' | 'email'>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      programs: {
        Row: ProgramRow;
        Insert: Insertable<ProgramRow, 'name'>;
        Update: Partial<ProgramRow>;
        Relationships: [
          {
            foreignKeyName: 'programs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      episodes: {
        Row: EpisodeRow;
        Insert: Insertable<EpisodeRow, 'program_id' | 'title'>;
        Update: Partial<EpisodeRow>;
        Relationships: [
          {
            foreignKeyName: 'episodes_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'episodes_audio_file_id_fkey';
            columns: ['audio_file_id'];
            isOneToOne: false;
            referencedRelation: 'audio_files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'episodes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'episodes_assigned_rj_fkey';
            columns: ['assigned_rj'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      audio_files: {
        Row: AudioFileRow;
        Insert: Insertable<
          AudioFileRow,
          'episode_id' | 'file_name' | 'storage_path' | 'mime_type' | 'file_size'
        >;
        Update: Partial<AudioFileRow>;
        Relationships: [
          {
            foreignKeyName: 'audio_files_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audio_files_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      qc_reviews: {
        Row: QcReviewRow;
        // Written only by approve_episode / reject_episode. No client policy.
        Insert: NoWrites;
        Update: NoWrites;
        Relationships: [
          {
            foreignKeyName: 'qc_reviews_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qc_reviews_reviewer_id_fkey';
            columns: ['reviewer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      schedules: {
        Row: ScheduleRow;
        Insert: Insertable<ScheduleRow, 'program_id' | 'start_time' | 'end_time'>;
        Update: Partial<ScheduleRow>;
        Relationships: [
          {
            foreignKeyName: 'schedules_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'schedules_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
        ];
      };
      broadcast_state: {
        Row: BroadcastStateRow;
        // Written only by start_broadcast / end_broadcast / sync_broadcast_state.
        Insert: NoWrites;
        Update: NoWrites;
        Relationships: [
          {
            foreignKeyName: 'broadcast_state_current_schedule_id_fkey';
            columns: ['current_schedule_id'];
            isOneToOne: false;
            referencedRelation: 'schedules';
            referencedColumns: ['id'];
          },
        ];
      };
      station_slots: {
        Row: StationSlotRow;
        Insert: Insertable<StationSlotRow, 'title' | 'start_time' | 'end_time'>;
        Update: Partial<StationSlotRow>;
        Relationships: [
          {
            foreignKeyName: 'station_slots_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      studio_bookings: {
        Row: StudioBookingRow;
        Insert: Insertable<
          StudioBookingRow,
          'rj_id' | 'booking_date' | 'start_time' | 'end_time' | 'show_name' | 'language'
        >;
        Update: Partial<StudioBookingRow>;
        Relationships: [
          {
            foreignKeyName: 'studio_bookings_rj_id_fkey';
            columns: ['rj_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'studio_bookings_editor_id_fkey';
            columns: ['editor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'studio_bookings_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_logs: {
        Row: ActivityLogRow;
        // Written only by app.log(). Append-only audit trail.
        Insert: NoWrites;
        Update: NoWrites;
        Relationships: [
          {
            foreignKeyName: 'activity_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      v_schedule_details: { Row: ScheduleDetailsRow; Relationships: [] };
      v_current_broadcast: { Row: CurrentBroadcastRow; Relationships: [] };
      v_next_broadcast: { Row: ScheduleDetailsRow; Relationships: [] };
      v_public_now_playing: { Row: PublicNowPlayingRow; Relationships: [] };
      v_public_schedule_today: { Row: PublicScheduleRow; Relationships: [] };
      v_public_programs: { Row: PublicProgramRow; Relationships: [] };
      v_public_recent_episodes: { Row: PublicEpisodeRow; Relationships: [] };
      v_public_fixed_point_chart: { Row: PublicChartRow; Relationships: [] };
      v_public_studio_calendar: { Row: PublicStudioSlotRow; Relationships: [] };
    };
    Functions: {
      submit_episode_for_qc: { Args: { p_episode_id: string }; Returns: EpisodeRow };
      approve_episode: {
        Args: { p_episode_id: string; p_comment?: string | null };
        Returns: EpisodeRow;
      };
      reject_episode: { Args: { p_episode_id: string; p_comment: string }; Returns: EpisodeRow };
      reopen_episode: { Args: { p_episode_id: string }; Returns: EpisodeRow };
      archive_episode: { Args: { p_episode_id: string }; Returns: EpisodeRow };
      schedule_episode: {
        Args: {
          p_program_id: string;
          p_episode_id: string | null;
          p_start_time: string;
          p_end_time: string;
          p_notes?: string | null;
        };
        Returns: ScheduleRow;
      };
      cancel_schedule: {
        Args: { p_schedule_id: string; p_reason?: string | null };
        Returns: ScheduleRow;
      };
      start_broadcast: { Args: { p_schedule_id: string }; Returns: BroadcastStateRow };
      end_broadcast: { Args: Record<PropertyKey, never>; Returns: BroadcastStateRow };
      sync_broadcast_state: { Args: Record<PropertyKey, never>; Returns: BroadcastStateRow };
      delete_user: {
        Args: { p_user_id: string };
        Returns: { id: string; email: string; full_name: string };
      };
    };
    Enums: {
      user_role: UserRole;
      episode_status: EpisodeStatus;
      qc_decision: QcDecision;
      schedule_status: ScheduleStatus;
      broadcast_status: BroadcastStatus;
      booking_status: BookingStatus;
      booking_origin: BookingOrigin;
      show_language: ShowLanguage;
      script_approval: ScriptApproval;
    };
    CompositeTypes: Record<string, never>;
  };
}
