import { Link } from 'react-router-dom';
import type { CurrentBroadcastRow, ScheduleDetailsRow } from '@/types/database';
import { formatTime } from '@/utils/datetime';

export function OnAirCard({ current }: { current: CurrentBroadcastRow | null }) {
  const live = current?.broadcast_status === 'ON_AIR';

  return (
    <section className={`card onair ${live ? 'live' : ''}`}>
      <span className="onair-status">
        <span className="onair-dot" />
        {live ? 'On air' : 'Offline'}
      </span>

      {live && current ? (
        <>
          <p className="onair-title">{current.program_name}</p>
          <p className="onair-meta">
            {current.episode_title ?? 'Live show'}
            {current.host_name ? ` · ${current.host_name}` : ''}
          </p>
          <p className="onair-meta small">
            {formatTime(current.start_time)} - {formatTime(current.end_time)}
            {current.started_at && ` · started ${formatTime(current.started_at)}`}
          </p>
        </>
      ) : (
        <>
          <p className="onair-title">Nothing on air</p>
          <p className="onair-meta">
            The station is off air. Start a scheduled slot from{' '}
            <Link to="/live">On Air</Link>.
          </p>
        </>
      )}
    </section>
  );
}

export function NextUpCard({ next }: { next: ScheduleDetailsRow | null }) {
  return (
    <section className="card">
      <h2>Next up</h2>
      {next ? (
        <>
          <p className="onair-title">{next.program_name}</p>
          <p className="onair-meta">
            {next.episode_title ?? 'Live show'}
            {next.host_name ? ` · ${next.host_name}` : ''}
          </p>
          <p className="onair-meta small">
            {formatTime(next.start_time)} - {formatTime(next.end_time)}
          </p>
        </>
      ) : (
        <p className="empty">Nothing scheduled after this.</p>
      )}
    </section>
  );
}
