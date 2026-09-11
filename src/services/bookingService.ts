import { supabase } from '@/lib/supabase';
import { AppError, toAppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type {
  ProfileRow,
  ScriptApproval,
  ShowLanguage,
  StudioBookingRow,
} from '@/types/database';
import type { LineupBooking } from '@/utils/lineup';
import {
  bookableSlots,
  deriveWeek,
  weekdaysFrom,
  type CalendarDay,
  type GridSlot,
} from '@/utils/studio';

// Re-exported so callers keep importing calendar types from the service they
// already use. The derivation itself lives in utils/studio.ts because it is
// pure grid logic with no database in it -- which is also what lets it be
// tested without pulling the Supabase client into the test project.
export {
  deriveWeek,
  type CalendarDay,
  type CalendarSlot,
  type SlotState,
} from '@/utils/studio';

/** A booking with the people attached, for lists and detail views. */
export type BookingWithPeople = StudioBookingRow & {
  rj: Pick<ProfileRow, 'id' | 'full_name' | 'email'> | null;
  editor: Pick<ProfileRow, 'id' | 'full_name'> | null;
  program: { id: string; name: string } | null;
};

const BOOKING_SELECT = `
  *,
  rj:profiles!studio_bookings_rj_id_fkey (id, full_name, email),
  editor:profiles!studio_bookings_editor_id_fkey (id, full_name),
  program:programs!studio_bookings_program_id_fkey (id, name)
`;

/**
 * A booking as the on-air lineup needs it: who is presenting, what programme it
 * is, and the recording if one has been attached. Kept separate from
 * BOOKING_SELECT so the episode join only happens where it is used.
 */
const LINEUP_SELECT = `
  id, reference, booking_date, start_time, end_time, status,
  rj:profiles!studio_bookings_rj_id_fkey (full_name),
  program:programs!studio_bookings_program_id_fkey (name),
  episode:episodes!studio_bookings_episode_id_fkey (title)
`;

export type LineupBookingRow = LineupBooking;

export interface BookingInput {
  booking_date: string;
  start_time: string;
  program_id: string;
  language: ShowLanguage;
  script_status: ScriptApproval;
  script_approver?: string | null;
  self_edit: boolean;
  editor_id?: string | null;
  notes?: string | null;
  /** Admin-only. The database refuses this from anyone else. */
  override_reason?: string | null;
}

export const bookingService = {
  /**
   * The week's occupancy.
   *
   * Occupancy comes from the anonymous-safe view, which carries only date and
   * time -- so this works signed out, and a signed-in RJ still learns nothing
   * about other people's shows. Their own bookings are fetched separately and
   * merged, which is the only way identity enters the calendar.
   */
  async getWeek(monday: string, viewerId: string | null): Promise<CalendarDay[]> {
    const days = weekdaysFrom(monday);
    const from = days[0];
    const to = days[days.length - 1];

    const occupied = await unwrap(
      supabase
        .from('v_public_studio_calendar')
        .select('booking_date, start_time, end_time')
        .gte('booking_date', from)
        .lte('booking_date', to),
    );

    let mine: StudioBookingRow[] = [];
    if (viewerId) {
      mine = await unwrap(
        supabase
          .from('studio_bookings')
          .select('*')
          .eq('rj_id', viewerId)
          .gte('booking_date', from)
          .lte('booking_date', to),
      );
    }

    return deriveWeek(days, occupied, mine, viewerId);
  },

  /** Bookable rows only, for the mobile day view. */
  slotTemplate(): GridSlot[] {
    return bookableSlots();
  },

  async getMyBookings(userId: string): Promise<BookingWithPeople[]> {
    return unwrap(
      supabase
        .from('studio_bookings')
        .select(BOOKING_SELECT)
        .eq('rj_id', userId)
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
        .returns<BookingWithPeople[]>(),
    );
  },

  /**
   * The confirmed sessions for one station day, for the on-air lineup.
   *
   * Every signed-in station member may read bookings (the
   * `bookings_select_station_members` policy), which is what lets the dashboard
   * name the jockey who is on air rather than only the programme.
   */
  async getBookingsForDay(day: string): Promise<LineupBooking[]> {
    return unwrap(
      supabase
        .from('studio_bookings')
        .select(LINEUP_SELECT)
        .eq('booking_date', day)
        .neq('status', 'CANCELLED')
        .order('start_time')
        .returns<LineupBooking[]>(),
    );
  },

  /** Every booking, for the admin view. RLS still decides what comes back. */
  async getAllBookings(limit = 200): Promise<BookingWithPeople[]> {
    return unwrap(
      supabase
        .from('studio_bookings')
        .select(BOOKING_SELECT)
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(limit)
        .returns<BookingWithPeople[]>(),
    );
  },

  async getBooking(id: string): Promise<BookingWithPeople> {
    return unwrap(
      supabase
        .from('studio_bookings')
        .select(BOOKING_SELECT)
        .eq('id', id)
        .single()
        .returns<BookingWithPeople>(),
    );
  },

  /** Real accounts that may be assigned as an editor. */
  async getEditors(): Promise<ProfileRow[]> {
    return unwrap(
      supabase
        .from('profiles')
        .select('*')
        .in('role', ['EDITOR', 'PRODUCER'])
        .eq('active', true)
        .order('full_name'),
    );
  },

  /** How many live bookings each editor already carries, for the picker. */
  async getEditorLoad(): Promise<Record<string, number>> {
    const rows = await unwrap(
      supabase
        .from('studio_bookings')
        .select('editor_id')
        .not('editor_id', 'is', null)
        .eq('status', 'CONFIRMED')
        .gte('booking_date', new Date().toISOString().slice(0, 10)),
    );

    const load: Record<string, number> = {};
    for (const row of rows) {
      const id = row.editor_id;
      if (id) load[id] = (load[id] ?? 0) + 1;
    }
    return load;
  },

  /**
   * Create a booking.
   *
   * Everything that matters is decided by the database: the grid constraints,
   * the 24-hour window trigger, the editor checks, the unique index that stops
   * double booking, and the trigger that allocates the VCR reference. This
   * function's only job is to send the row and translate a refusal into a
   * sentence -- it never pre-approves a booking.
   */
  async createBooking(input: BookingInput, rjId: string, createdBy: string): Promise<StudioBookingRow> {
    const startTime = `${input.start_time}:00`;
    // The 30-minute duration is a CHECK constraint; computing it here keeps the
    // insert honest rather than letting the caller pick an end time.
    const [h, m] = input.start_time.split(':').map(Number);
    const endMinutes = h * 60 + m + 30;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(
      endMinutes % 60,
    ).padStart(2, '0')}:00`;

    const { data, error } = await supabase
      .from('studio_bookings')
      .insert({
        rj_id: rjId,
        booking_date: input.booking_date,
        start_time: startTime,
        end_time: endTime,
        program_id: input.program_id,
        language: input.language,
        script_status: input.script_status,
        script_approver: input.script_approver?.trim() || null,
        self_edit: input.self_edit,
        editor_id: input.self_edit ? null : (input.editor_id ?? null),
        notes: input.notes?.trim() || null,
        origin: input.override_reason ? 'ADMIN_OVERRIDE' : 'RJ',
        override_reason: input.override_reason?.trim() || null,
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error) throw translateBookingError(error);
    if (!data) {
      throw new AppError('UNKNOWN', 'The booking could not be created. Please try again.');
    }
    return data;
  },

  /**
   * Cancel a booking.
   *
   * RLS decides whether the caller may touch the row at all, and the guard
   * trigger from migration 12 decides whether it is still cancellable. A write
   * that RLS filters out returns no rows, which is why the empty result is
   * treated as a refusal rather than a success.
   */
  async cancelBooking(id: string, reason?: string): Promise<StudioBookingRow> {
    const patch: Partial<StudioBookingRow> = { status: 'CANCELLED' };
    if (reason?.trim()) patch.notes = reason.trim();

    const { data, error } = await supabase
      .from('studio_bookings')
      .update(patch)
      .eq('id', id)
      .select('*');

    if (error) throw translateBookingError(error);
    if (!data || data.length === 0) {
      throw new AppError(
        'PERMISSION',
        'This booking cannot be cancelled from here. It may have already started, or belong to someone else.',
      );
    }
    return data[0];
  },

  /**
   * Tie a recording to the session it came from (RJ -> show -> booking -> audio).
   *
   * The RLS update policy only lets an RJ touch their own CONFIRMED booking, so
   * once an administrator has settled a session as COMPLETED or NO_SHOW the
   * link has to be made by staff. The recording itself is never blocked by
   * this -- the episode exists either way.
   */
  async linkEpisode(bookingId: string, episodeId: string): Promise<StudioBookingRow> {
    const { data, error } = await supabase
      .from('studio_bookings')
      .update({ episode_id: episodeId })
      .eq('id', bookingId)
      .select('*');

    if (error) throw translateBookingError(error);
    if (!data || data.length === 0) {
      throw new AppError(
        'PERMISSION',
        'The recording was saved, but it could not be linked to this booking. Ask an administrator to attach it.',
      );
    }
    return data[0];
  },

  /** Admin: reassign the editor on an existing booking. */
  async assignEditor(id: string, editorId: string | null): Promise<StudioBookingRow> {
    const { data, error } = await supabase
      .from('studio_bookings')
      .update({ editor_id: editorId, self_edit: editorId === null })
      .eq('id', id)
      .select('*');

    if (error) throw translateBookingError(error);
    if (!data || data.length === 0) {
      throw new AppError('PERMISSION', 'You do not have permission to change this booking.');
    }
    return data[0];
  },
};

/**
 * Turn a database refusal into something a person can act on.
 *
 * Each branch matches a specific constraint or trigger from migrations 11 and
 * 12. Anything unrecognised falls through to the generic translator rather than
 * leaking SQL.
 */
function translateBookingError(error: unknown): AppError {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';

  const rules: [RegExp, string][] = [
    [
      /studio_bookings_slot_key|duplicate key/i,
      'This studio slot was just taken by someone else. Please pick another time.',
    ],
    [
      /bookings_weekday_only/i,
      'The studio is closed at weekends. Please choose a weekday.',
    ],
    [
      /bookings_operating_hours/i,
      'The studio is open from 9:00 AM to 6:00 PM.',
    ],
    [/bookings_not_lunch/i, 'The studio is closed for lunch between 1:00 PM and 2:00 PM.'],
    [/bookings_on_grid|bookings_half_hour/i, 'Bookings run in 30-minute slots starting on the half hour.'],
    [
      /bookings_override_needs_reason/i,
      'An override booking needs a short reason.',
    ],
    [/edit it myself/i, 'Choose "I will edit it myself" instead of assigning yourself as editor.'],
    [/not an editor|editor account is not active/i, 'That person is not available as an editor.'],
    [/24 hours in advance/i, 'Studio bookings must be made at least 24 hours in advance.'],
    [
      /Only an administrator can create an override/i,
      'Only an administrator can book inside the 24-hour window.',
    ],
    [/already started/i, 'This booking has already started and can no longer be cancelled here.'],
    [
      /row-level security/i,
      'You do not have permission to create or change this booking.',
    ],
  ];

  for (const [pattern, text] of rules) {
    if (pattern.test(message)) {
      const kind =
        /slot_key|duplicate key/i.test(message) ? 'CONFLICT'
        : /row-level security|administrator|already started/i.test(message) ? 'PERMISSION'
        : 'VALIDATION';
      return new AppError(kind, text, error);
    }
  }

  return toAppError(error);
}
