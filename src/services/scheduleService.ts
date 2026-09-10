import { supabase } from '@/lib/supabase';
import { assertWritten } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { ScheduleDetailsRow, ScheduleRow, ScheduleStatus } from '@/types/database';
import { stationDay, stationDayRange } from '@/utils/datetime';

export interface ScheduleInput {
  program_id: string;
  episode_id: string | null;
  start_time: string;
  end_time: string;
  notes?: string | null;
}

export interface ScheduleRangeFilters {
  from: string;
  to: string;
  status?: ScheduleStatus[];
}

export const scheduleService = {
  async getSchedules(filters: ScheduleRangeFilters): Promise<ScheduleDetailsRow[]> {
    let query = supabase
      .from('v_schedule_details')
      .select('*')
      .gte('start_time', filters.from)
      .lt('start_time', filters.to)
      .order('start_time');

    if (filters.status?.length) query = query.in('status', filters.status);
    return unwrap(query);
  },

  async getTodaySchedule(day: string = stationDay()): Promise<ScheduleDetailsRow[]> {
    const { start, end } = stationDayRange(day);
    return this.getSchedules({ from: start, to: end });
  },

  async getWeekSchedule(startDay: string = stationDay()): Promise<ScheduleDetailsRow[]> {
    const { start } = stationDayRange(startDay);
    const end = new Date(new Date(start).getTime() + 7 * 24 * 3600 * 1000).toISOString();
    return this.getSchedules({ from: start, to: end });
  },

  async getUpcoming(limit = 10): Promise<ScheduleDetailsRow[]> {
    return unwrap(
      supabase
        .from('v_schedule_details')
        .select('*')
        .eq('status', 'SCHEDULED')
        .gt('end_time', new Date().toISOString())
        .order('start_time')
        .limit(limit),
    );
  },

  async getSchedulesForProgram(programId: string): Promise<ScheduleDetailsRow[]> {
    return unwrap(
      supabase
        .from('v_schedule_details')
        .select('*')
        .eq('program_id', programId)
        .order('start_time', { ascending: false }),
    );
  },

  /**
   * Goes through the RPC so the overlap check, the approved-episode check and
   * the inactive-program check all happen in one transaction, and the clash is
   * reported by name rather than as a constraint code.
   */
  async createSchedule(input: ScheduleInput): Promise<ScheduleRow> {
    return unwrap(
      supabase.rpc('schedule_episode', {
        p_program_id: input.program_id,
        p_episode_id: input.episode_id,
        p_start_time: input.start_time,
        p_end_time: input.end_time,
        p_notes: input.notes ?? null,
      }),
    );
  },

  /** Times and notes only. Status is owned by the broadcast functions. */
  async updateSchedule(
    id: string,
    patch: { start_time?: string; end_time?: string; notes?: string | null },
  ): Promise<ScheduleRow> {
    const rows = await unwrap(supabase.from('schedules').update(patch).eq('id', id).select('*'));
    return assertWritten(rows, 'schedule');
  },

  async cancelSchedule(id: string, reason?: string): Promise<ScheduleRow> {
    return unwrap(
      supabase.rpc('cancel_schedule', {
        p_schedule_id: id,
        p_reason: reason?.trim() || null,
      }),
    );
  },

  /**
   * Advisory check so the form can warn before submitting. The database still
   * has the final say via the exclusion constraint -- this is convenience only.
   */
  async findConflicts(
    startTime: string,
    endTime: string,
    excludeScheduleId?: string,
  ): Promise<ScheduleDetailsRow[]> {
    let query = supabase
      .from('v_schedule_details')
      .select('*')
      .neq('status', 'CANCELLED')
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (excludeScheduleId) query = query.neq('id', excludeScheduleId);
    return unwrap(query);
  },
};
