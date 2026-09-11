import { useEffect, useMemo, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { broadcastService } from '@/services/broadcastService';
import { scheduleService } from '@/services/scheduleService';
import { bookingService } from '@/services/bookingService';
import { stationDay, stationDayRange } from '@/utils/datetime';
import {
  buildLineup,
  deriveOnAir,
  findNextUp,
  type OnAirState,
  type StationSlot,
} from '@/utils/lineup';

/**
 * How often the clock advances for the purposes of "is this on air".
 *
 * The transition has to happen on its own -- nobody reloads the dashboard at
 * 10:00:00 to watch it go live -- but a slot boundary is a half-hour grid line,
 * so a quarter minute of lag is invisible and costs nothing.
 */
const TICK_MS = 15_000;

/**
 * How often the lineup itself is re-read. Slower than the tick, because this
 * one is a network round trip and only matters when somebody elsewhere books,
 * cancels or reschedules something.
 */
const REFRESH_MS = 60_000;

export interface StationStatus {
  onAir: OnAirState;
  next: StationSlot | null;
  /** Everything scheduled for the current station day, in order. */
  today: StationSlot[];
  /** The clock the derivation used, so callers agree on "now". */
  now: number;
  /** True only on the first load; a background refresh does not blank the UI. */
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * What the station is doing right now, from the rows that already exist.
 *
 * Reads the schedule and the confirmed studio bookings for the station day,
 * merges them (see utils/lineup), and re-derives on a timer so the card moves
 * from OFFLINE to ON AIR when the slot starts and back when it ends, without a
 * page reload and without anybody pressing anything.
 */
export function useStationStatus(): StationStatus {
  const lineup = useAsync(async () => {
    // Close any slot whose end time has passed before reading the state, so a
    // manually started broadcast cannot claim to still be on air hours later.
    await broadcastService.syncBroadcastState().catch(() => undefined);

    const day = stationDay();
    const [schedules, bookings, current] = await Promise.all([
      scheduleService.getStationDay(day),
      // A role that cannot read bookings still gets the schedule; the lineup is
      // simply missing the jockey's name for it.
      bookingService.getBookingsForDay(day).catch(() => []),
      broadcastService.getCurrentBroadcast().catch(() => null),
    ]);

    return { day, slots: buildLineup(schedules, bookings), current };
  }, []);

  const [now, setNow] = useState(() => Date.now());
  const { reload } = lineup;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    const refresh = setInterval(() => void reload(), REFRESH_MS);

    // Coming back to a tab that has been in the background for an hour should
    // show the station as it is now, not as it was when the tab was hidden.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
        void reload();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(tick);
      clearInterval(refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const slots = useMemo(() => lineup.data?.slots ?? [], [lineup.data]);
  const day = lineup.data?.day ?? stationDay();

  const today = useMemo(() => {
    const { start, end } = stationDayRange(day);
    const from = new Date(start).getTime();
    const to = new Date(end).getTime();
    return slots.filter((slot) => {
      const startsAt = new Date(slot.startsAt).getTime();
      return startsAt >= from && startsAt < to;
    });
  }, [slots, day]);

  const onAir = useMemo(
    () => deriveOnAir(slots, lineup.data?.current ?? null, now),
    [slots, lineup.data, now],
  );

  // Next up is the rest of the station day only: the window fetched stops at
  // midnight, so this never promises something from tomorrow.
  const next = useMemo(() => findNextUp(today, now), [today, now]);

  return {
    onAir,
    next,
    today,
    now,
    loading: lineup.loading && lineup.data === null,
    error: lineup.error,
    reload,
  };
}
