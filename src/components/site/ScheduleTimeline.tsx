import type { PublicScheduleRow } from '@/types/database';
import { formatTime } from '@/utils/datetime';

type SlotState = 'live' | 'next' | 'done' | 'later';

/**
 * Broadcast timeline, not a stack of cards.
 *
 * State is derived from the clock as well as the stored status, because a slot
 * can be marked SCHEDULED while its window is already open — the CMS only
 * reconciles that when someone loads a dashboard. The public page should say
 * what is true now.
 */
function stateOf(slot: PublicScheduleRow, nextId: string | null): SlotState {
  const start = new Date(slot.start_time).getTime();
  const end = new Date(slot.end_time).getTime();
  const now = Date.now();

  if (slot.status === 'ON_AIR') return 'live';
  if (slot.status === 'COMPLETED' || end <= now) return 'done';
  if (slot.id === nextId) return 'next';
  return start <= now && now < end ? 'next' : 'later';
}

const STATE_LABEL: Record<SlotState, string> = {
  live: 'Live now',
  next: 'Coming up',
  done: 'Completed',
  later: '',
};

export function ScheduleTimeline({ slots }: { slots: PublicScheduleRow[] }) {
  const now = Date.now();
  const nextId =
    slots.find((s) => s.status !== 'COMPLETED' && new Date(s.end_time).getTime() > now)?.id ??
    null;

  if (slots.length === 0) {
    return (
      <p className="section-empty">
        Nothing is scheduled today. The grid is set a day ahead &mdash; check back tomorrow.
      </p>
    );
  }

  return (
    <ol className="timeline">
      {slots.map((slot) => {
        const state = stateOf(slot, nextId);
        return (
          <li key={slot.id} className={`timeline-row is-${state}`}>
            <div className="timeline-time">
              <time dateTime={slot.start_time}>{formatTime(slot.start_time)}</time>
              <span className="timeline-dash">&ndash;</span>
              <time dateTime={slot.end_time}>{formatTime(slot.end_time)}</time>
            </div>

            <span className="timeline-marker" aria-hidden="true" />

            <div className="timeline-body">
              <h3 className="timeline-show">{slot.program_name}</h3>
              {slot.episode_title && <p className="timeline-episode">{slot.episode_title}</p>}
              {slot.host_name && <p className="timeline-host">with {slot.host_name}</p>}
            </div>

            {STATE_LABEL[state] && (
              <span className={`timeline-state state-${state}`}>{STATE_LABEL[state]}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
