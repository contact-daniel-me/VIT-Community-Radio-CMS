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
});
