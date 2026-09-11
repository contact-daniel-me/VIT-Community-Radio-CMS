import { Link } from 'react-router-dom';
import { slotProgress, type OnAirState, type StationSlot } from '@/utils/lineup';
import { formatRelative, formatTime } from '@/utils/datetime';

/**
 * What to call the slot when the data behind it is incomplete.
 *
 * A booking always has a programme and a schedule always has one too, but a
 * join can still come back empty for a role that cannot read the other table --
 * and an empty card is worse than a plain one. So the card names the slot with
 * the best thing it actually has, and never renders a blank heading.
 */
function slotTitle(slot: StationSlot): string {
  return slot.programName ?? slot.episodeTitle ?? 'Studio session';
}

/** The second line: the episode, or an honest statement that there isn't one. */
function slotSubtitle(slot: StationSlot): string | null {
  if (slot.episodeTitle && slot.episodeTitle !== slotTitle(slot)) return slot.episodeTitle;
  return slot.programName ? 'Live show' : null;
}

export function OnAirCard({
  state,
  now,
  loading = false,
}: {
  state: OnAirState;
  now: number;
  loading?: boolean;
}) {
  const { live, slot, startedAt } = state;

  if (!live || !slot) {
    return (
      <section className="card onair">
        <span className="onair-status">
          <span className="onair-dot" />
          Offline
        </span>
        <p className="onair-title">{loading ? 'Checking the schedule...' : 'Nothing on air'}</p>
        {!loading && (
          <p className="onair-meta">
            Nothing is scheduled for right now. Start a slot from{' '}
            <Link to="/live">On Air</Link>, or check the{' '}
            <Link to="/schedule">schedule</Link>.
          </p>
        )}
      </section>
    );
  }

  const subtitle = slotSubtitle(slot);
  const progress = slotProgress(slot, now);

  return (
    <section className="card onair live">
      <span className="onair-status">
        <span className="onair-dot" />
        On air
      </span>

      <p className="onair-title">{slotTitle(slot)}</p>
      {subtitle && <p className="onair-meta">{subtitle}</p>}

      {slot.hostName && (
        <p className="onair-host">
          <span className="muted">Hosted by</span> <strong>{slot.hostName}</strong>
        </p>
      )}

      <div
        className="onair-progress"
        role="progressbar"
        aria-label="Progress through the current slot"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>

      <dl className="onair-times">
        <div>
          <dt>Started</dt>
          {/* `startedAt` is set only when an operator pressed Start; otherwise
              the slot is on air because its scheduled time has come. */}
          <dd>{formatTime(startedAt ?? slot.startsAt)}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{formatTime(slot.endsAt)}</dd>
        </div>
      </dl>

      {slot.reference && (
        <p className="onair-meta small">Studio booking {slot.reference}</p>
      )}
    </section>
  );
}

export function NextUpCard({ next }: { next: StationSlot | null }) {
  return (
    <section className="card">
      <h2>Next up</h2>
      {next ? (
        <>
          <p className="onair-title">{slotTitle(next)}</p>
          {slotSubtitle(next) && <p className="onair-meta">{slotSubtitle(next)}</p>}
          {next.hostName && (
            <p className="onair-host">
              <span className="muted">Hosted by</span> <strong>{next.hostName}</strong>
            </p>
          )}
          <p className="onair-meta small">
            {formatTime(next.startsAt)} &ndash; {formatTime(next.endsAt)}
            <span className="muted"> &middot; starts {formatRelative(next.startsAt)}</span>
          </p>
        </>
      ) : (
        <p className="empty">Nothing else scheduled today.</p>
      )}
    </section>
  );
}
