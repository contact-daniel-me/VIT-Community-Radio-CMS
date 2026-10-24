import { supabase } from '@/lib/supabase';
import { AppError, toAppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { ProfileRow, StudioHolidayRow } from '@/types/database';

export type HolidayWithCreator = StudioHolidayRow & {
  creator: Pick<ProfileRow, 'id' | 'full_name' | 'email' | 'role'> | null;
};

const HOLIDAY_SELECT = `
  *,
  creator:profiles!studio_holidays_created_by_fkey (id, full_name, email, role)
`;

const LOCAL_STORAGE_KEY = 'vcr_fallback_studio_holidays';

function isMissingTableError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const err = error as { code?: string; message?: string; details?: string };
    if (err.code === 'PGRST205' || err.code === '42P01') return true;
    if (err.message && /could not find the table .*studio_holidays/i.test(err.message)) return true;
  }
  return false;
}

function getLocalHolidays(): StudioHolidayRow[] {
  try {
    const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    if (!storage) return [];
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalHolidays(holidays: StudioHolidayRow[]): void {
  try {
    const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    if (storage) {
      storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(holidays));
    }
  } catch {
    // ignore
  }
}

export interface HolidayInput {
  start_date: string;
  end_date: string;
  reason?: string | null;
  slots?: string[] | null;
}

import { parseHolidaySlots, formatHolidayReason } from '../utils/studio';
export { parseHolidaySlots, formatHolidayReason };

export const holidayService = {
  /** Fetch all holidays, latest first. */
  async getHolidays(): Promise<HolidayWithCreator[]> {
    try {
      return await unwrap(
        supabase
          .from('studio_holidays')
          .select(HOLIDAY_SELECT)
          .order('start_date', { ascending: false })
          .returns<HolidayWithCreator[]>(),
      );
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalHolidays();
        return local
          .map((h) => ({
            ...h,
            creator: {
              id: h.created_by ?? 'admin',
              full_name: 'Administrator',
              email: 'admin@vit.ac.in',
              role: 'ADMIN' as const,
            },
          }))
          .sort((a, b) => b.start_date.localeCompare(a.start_date));
      }
      throw translateHolidayError(err);
    }
  },

  /** Fetch holidays that intersect [from, to] inclusive. */
  async getHolidaysForRange(from: string, to: string): Promise<StudioHolidayRow[]> {
    try {
      return await unwrap(
        supabase
          .from('studio_holidays')
          .select('*')
          .lte('start_date', to)
          .gte('end_date', from)
          .order('start_date')
          .returns<StudioHolidayRow[]>(),
      );
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalHolidays();
        return local.filter((h) => h.start_date <= to && h.end_date >= from);
      }
      throw translateHolidayError(err);
    }
  },

  /** Check if any active confirmed bookings exist in the date range (optionally filtered by slots). */
  async checkExistingBookings(
    startDate: string,
    endDate: string,
    slots?: string[] | null,
  ): Promise<{ count: number; sample: { id: string; reference: string | null; booking_date: string; start_time: string }[] }> {
    const { data, count, error } = await supabase
      .from('studio_bookings')
      .select('id, reference, booking_date, start_time', { count: 'exact' })
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .neq('status', 'CANCELLED');

    if (error) throw toAppError(error);

    let rows = (data ?? []) as { id: string; reference: string | null; booking_date: string; start_time: string }[];
    if (slots && slots.length > 0) {
      const slotSet = new Set(slots.map((s) => s.slice(0, 5)));
      rows = rows.filter((r) => slotSet.has(r.start_time.slice(0, 5)));
      return {
        count: rows.length,
        sample: rows.slice(0, 5),
      };
    }

    return {
      count: count ?? rows.length,
      sample: rows.slice(0, 5),
    };
  },

  /** Create a new holiday / closure record. Admin only. */
  async createHoliday(input: HolidayInput, createdBy: string): Promise<StudioHolidayRow> {
    if (input.end_date < input.start_date) {
      throw new AppError('VALIDATION', 'Holiday end date cannot be earlier than start date.');
    }

    const slots = input.slots && input.slots.length > 0 ? input.slots.map((s) => s.slice(0, 5)) : null;
    const cleanReason = input.reason?.trim() || null;
    const reasonWithTag = slots
      ? `[SLOTS:${slots.join(',')}] ${cleanReason || ''}`.trim()
      : cleanReason;

    try {
      const { data, error } = await supabase
        .from('studio_holidays')
        .insert({
          start_date: input.start_date,
          end_date: input.end_date,
          reason: reasonWithTag,
          slots: slots,
          created_by: createdBy,
        })
        .select('*')
        .single();

      if (!error && data) return data;

      // Graceful fallback if database column 'slots' does not exist yet
      if (error && (error.code === '42703' || /column.*slots.*does not exist/i.test(error.message))) {
        const fallback = await unwrap(
          supabase
            .from('studio_holidays')
            .insert({
              start_date: input.start_date,
              end_date: input.end_date,
              reason: reasonWithTag,
              created_by: createdBy,
            })
            .select('*')
            .single(),
        );
        return fallback;
      }

      if (error) throw error;
      if (!data) throw new AppError('UNKNOWN', 'Could not create holiday record.');
      return data;
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalHolidays();
        const hasOverlap = local.some((h) => {
          if (!(h.start_date <= input.end_date && h.end_date >= input.start_date)) return false;
          const existingSlots = parseHolidaySlots(h);
          if (!existingSlots || !slots) return true;
          return existingSlots.some((s: string) => slots.includes(s));
        });
        if (hasOverlap) {
          throw new AppError(
            'CONFLICT',
            'A holiday or closure has already been scheduled that overlaps with this date or time slot.',
          );
        }
        const newRecord: StudioHolidayRow = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `holiday-${Date.now()}`,
          start_date: input.start_date,
          end_date: input.end_date,
          reason: reasonWithTag,
          slots: slots,
          created_by: createdBy,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        local.push(newRecord);
        saveLocalHolidays(local);
        return newRecord;
      }
      throw translateHolidayError(err);
    }
  },

  /** Edit an existing holiday record. Admin only. */
  async updateHoliday(id: string, patch: Partial<HolidayInput>): Promise<StudioHolidayRow> {
    if (patch.start_date && patch.end_date && patch.end_date < patch.start_date) {
      throw new AppError('VALIDATION', 'Holiday end date cannot be earlier than start date.');
    }

    const slots =
      patch.slots !== undefined
        ? patch.slots && patch.slots.length > 0
          ? patch.slots.map((s) => s.slice(0, 5))
          : null
        : undefined;

    const cleanReason = patch.reason !== undefined ? patch.reason?.trim() || null : undefined;

    try {
      const updatePayload: Partial<StudioHolidayRow> = {};
      if (patch.start_date !== undefined) updatePayload.start_date = patch.start_date;
      if (patch.end_date !== undefined) updatePayload.end_date = patch.end_date;
      if (slots !== undefined) updatePayload.slots = slots;
      if (cleanReason !== undefined || slots !== undefined) {
        updatePayload.reason = slots
          ? `[SLOTS:${slots.join(',')}] ${cleanReason || ''}`.trim()
          : (cleanReason ?? null);
      }

      const { data, error } = await supabase
        .from('studio_holidays')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (!error && data) return data;

      // Graceful fallback if database column 'slots' does not exist yet
      if (error && (error.code === '42703' || /column.*slots.*does not exist/i.test(error.message))) {
        delete updatePayload.slots;
        const fallback = await unwrap(
          supabase
            .from('studio_holidays')
            .update(updatePayload)
            .eq('id', id)
            .select('*')
            .single(),
        );
        return fallback;
      }

      if (error) throw error;
      if (!data) throw new AppError('NOT_FOUND', 'Holiday record not found.');
      return data;
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalHolidays();
        const idx = local.findIndex((h) => h.id === id);
        if (idx === -1) throw new AppError('NOT_FOUND', 'Holiday record not found.');
        const updated: StudioHolidayRow = {
          ...local[idx],
          ...(patch.start_date ? { start_date: patch.start_date } : {}),
          ...(patch.end_date ? { end_date: patch.end_date } : {}),
          ...(slots !== undefined ? { slots } : {}),
          ...(cleanReason !== undefined || slots !== undefined
            ? {
                reason: slots
                  ? `[SLOTS:${slots.join(',')}] ${cleanReason || ''}`.trim()
                  : (cleanReason ?? null),
              }
            : {}),
          updated_at: new Date().toISOString(),
        };
        local[idx] = updated;
        saveLocalHolidays(local);
        return updated;
      }
      throw translateHolidayError(err);
    }
  },

  /** Remove a holiday / reopen the blocked date range. Admin only. */
  async deleteHoliday(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('studio_holidays')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalHolidays().filter((h) => h.id !== id);
        saveLocalHolidays(local);
        return;
      }
      throw translateHolidayError(err);
    }
  },
};

function translateHolidayError(error: unknown): AppError {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';

  if (/overlaps with this date range|duplicate/i.test(message)) {
    return new AppError(
      'CONFLICT',
      'A holiday or closure has already been scheduled that overlaps with this date range.',
      error,
    );
  }
  if (/cannot be earlier than start date/i.test(message)) {
    return new AppError('VALIDATION', 'Holiday end date cannot be earlier than start date.', error);
  }
  if (/row-level security|permission denied/i.test(message)) {
    return new AppError('PERMISSION', 'Only administrators can manage studio holidays.', error);
  }

  return toAppError(error);
}
