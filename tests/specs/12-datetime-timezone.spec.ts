import { describe, expect, it } from 'vitest';
import { formatTime, stationLocalToIso } from '@/utils/datetime';

describe('datetime and timezone handling', () => {
  it('formats UTC ISO strings in Asia/Kolkata timezone (+05:30)', () => {
    // 11:30 UTC is 17:00 (5:00 PM) in IST
    expect(formatTime('2026-10-22T11:30:00.000Z')).toBe('05:00 pm');
    // 12:00 UTC is 17:30 (5:30 PM) in IST
    expect(formatTime('2026-10-22T12:00:00.000Z')).toBe('05:30 pm');
    // 05:30 UTC is 11:00 (11:00 AM) in IST
    expect(formatTime('2026-10-22T05:30:00.000Z')).toBe('11:00 am');
  });

  it('treats date strings without timezone as station-local (+05:30)', () => {
    expect(formatTime('2026-10-22T17:00:00')).toBe('05:00 pm');
    expect(formatTime('2026-10-22 17:30:00')).toBe('05:30 pm');
  });

  it('formats plain time strings directly', () => {
    expect(formatTime('17:00')).toBe('05:00 pm');
    expect(formatTime('17:30:00')).toBe('05:30 pm');
    expect(formatTime('11:00:00')).toBe('11:00 am');
  });

  it('converts station-local datetime inputs to correct UTC ISO strings', () => {
    expect(stationLocalToIso('2026-10-22T17:00')).toBe('2026-10-22T11:30:00.000Z');
    expect(stationLocalToIso('2026-10-22T17:00:00')).toBe('2026-10-22T11:30:00.000Z');
    expect(stationLocalToIso('2026-10-22T17:30')).toBe('2026-10-22T12:00:00.000Z');
  });

  it('safely re-syncs studio bookings into schedules without exclusion constraint violations', async () => {
    const { createTestDb } = await import('../harness/db');
    const db = await createTestDb({ seed: true });

    // Step 1: Delete auto-scheduled rows
    await db.sql(`
      delete from public.schedules
      where notes like 'Auto-scheduled from booking%'
         or notes like 'Auto-scheduled from Studio Booking%';
    `);

    // Step 2: Re-populate with ON CONFLICT DO NOTHING
    await db.sql(`
      insert into public.schedules (program_id, episode_id, start_time, end_time, status, notes, created_by)
      select
        b.program_id,
        (
          select id from public.episodes e 
          where e.program_id = b.program_id and e.status = 'APPROVED'
          order by e.created_at desc limit 1
        ),
        (b.booking_date + b.start_time) at time zone 'Asia/Kolkata',
        (b.booking_date + b.end_time) at time zone 'Asia/Kolkata',
        'SCHEDULED',
        'Auto-scheduled from booking ' || b.reference,
        b.created_by
      from public.studio_bookings b
      join public.programs p on p.id = b.program_id
      where b.status = 'CONFIRMED'
        and p.active = true
      on conflict on constraint schedules_no_overlap do nothing;
    `);

    await db.close();
  });
});
