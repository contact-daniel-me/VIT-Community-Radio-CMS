import { supabase } from '@/lib/supabase';
import { assertWritten } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { ProgramRow } from '@/types/database';

export interface ProgramInput {
  name: string;
  description?: string | null;
  host_name?: string | null;
  category: string;
  default_duration_minutes: number;
  requires_audio: boolean;
}

export interface ProgramFilters {
  activeOnly?: boolean;
  search?: string;
}

export const programService = {
  async getPrograms(filters: ProgramFilters = {}): Promise<ProgramRow[]> {
    let query = supabase.from('programs').select('*').order('name');
    if (filters.activeOnly) query = query.eq('active', true);
    if (filters.search?.trim()) query = query.ilike('name', `%${filters.search.trim()}%`);
    return unwrap(query);
  },

  async getProgram(id: string): Promise<ProgramRow> {
    return unwrap(supabase.from('programs').select('*').eq('id', id).single());
  },

  async createProgram(input: ProgramInput, createdBy: string): Promise<ProgramRow> {
    return unwrap(
      supabase
        .from('programs')
        .insert({
          ...input,
          name: input.name.trim(),
          created_by: createdBy,
        })
        .select('*')
        .single(),
    );
  },

  async updateProgram(id: string, patch: Partial<ProgramInput>): Promise<ProgramRow> {
    const rows = await unwrap(
      supabase.from('programs').update(patch).eq('id', id).select('*'),
    );
    return assertWritten(rows, 'program');
  },

  /** Business rule 13: programs are deactivated, never deleted. */
  async setProgramActive(id: string, active: boolean): Promise<ProgramRow> {
    const rows = await unwrap(
      supabase.from('programs').update({ active }).eq('id', id).select('*'),
    );
    return assertWritten(rows, 'program');
  },

  async deactivateProgram(id: string): Promise<ProgramRow> {
    return this.setProgramActive(id, false);
  },
};
