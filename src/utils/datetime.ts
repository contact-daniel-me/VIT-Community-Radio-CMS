/**
 * All times are stored as `timestamptz` (UTC) and displayed in the station's
 * timezone. India has no daylight saving, so the offset is a constant +05:30 --
 * which makes the day-boundary maths below exact rather than approximate.
 */
export const STATION_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: STATION_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: STATION_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: STATION_TIMEZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const isoDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STATION_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Parse any date/time string, ensuring that strings without timezone
 * offsets (e.g. "2026-10-22T17:00:00" or "17:00:00") are interpreted in
 * station time (+05:30) rather than the local browser's timezone.
 */
export function parseStationDate(iso: string): Date {
  if (!iso) return new Date(NaN);
  const trimmed = iso.trim();
  // Plain time string: 'HH:MM' or 'HH:MM:SS'
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const today = stationDay();
    const timeWithSec = trimmed.length === 5 ? `${trimmed}:00` : trimmed;
    return new Date(`${today}T${timeWithSec}${IST_OFFSET}`);
  }
  // Check if string ends with timezone offset (+HH:MM, -HH:MM, or Z)
  if (/([+-]\d{2}:\d{2}|Z)$/i.test(trimmed)) {
    return new Date(trimmed);
  }
  // If string has space separator like '2026-10-22 17:00:00', normalize to T
  const formatted = trimmed.replace(' ', 'T');
  // If time is missing seconds like '2026-10-22T17:00'
  const withSec = /T\d{2}:\d{2}$/.test(formatted) ? `${formatted}:00` : formatted;
  return new Date(`${withSec}${IST_OFFSET}`);
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const d = parseStationDate(iso);
  return isNaN(d.getTime()) ? '--:--' : timeFormatter.format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = parseStationDate(iso);
  return isNaN(d.getTime()) ? '--' : dateFormatter.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = parseStationDate(iso);
  return isNaN(d.getTime()) ? '--' : dateTimeFormatter.format(d);
}

/** Station-local day as YYYY-MM-DD, which is what the date inputs use. */
export function stationDay(date: Date = new Date()): string {
  return isoDayFormatter.format(date);
}

/** UTC instants bounding one station-local day: [start, end). */
export function stationDayRange(day: string = stationDay()): { start: string; end: string } {
  const start = new Date(`${day}T00:00:00${IST_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Convert a datetime-local input value (station time) to a UTC ISO string. */
export function stationLocalToIso(value: string): string {
  if (!value) return '';
  const d = parseStationDate(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Convert a UTC ISO string to the value a datetime-local input expects. */
export function isoToStationLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';

  // en-CA renders midnight as 24; normalise it.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '--';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return minutes > 0 ? `${minutes} min ago` : `in ${-minutes} min`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours} h ago` : `in ${-hours} h`;
  const days = Math.round(hours / 24);
  return days > 0 ? `${days} d ago` : `in ${-days} d`;
}
