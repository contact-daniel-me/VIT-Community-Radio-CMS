import { useEffect, useState } from 'react';
import type { PublicNowPlayingRow } from '@/types/database';
import { formatTime } from '@/utils/datetime';
import { Waveform } from './Waveform';
import { WhatsNew } from './WhatsNew';

/** "38 min left" — recomputed each minute while a broadcast is running. */
function useRemaining(endTime: string | null | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!endTime) {
      setLabel(null);
      return;
    }
    const tick = () => {
      const ms = new Date(endTime).getTime() - Date.now();
      if (ms <= 0) {
        setLabel('finishing');
        return;
      }
      const minutes = Math.round(ms / 60000);
      setLabel(
        minutes >= 60
          ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min left`
          : `${Math.max(minutes, 1)} min left`,
      );
    };
    tick();
    const timer = window.setInterval(tick, 60000);
    return () => window.clearInterval(timer);
  }, [endTime]);

  return label;
}

export function LiveStatus({ now }: { now: PublicNowPlayingRow | null }) {
  const live = now?.broadcast_status === 'ON_AIR';
  const remaining = useRemaining(live ? now?.end_time : null);

  if (!live || !now) {
    return <WhatsNew />;
  }

  return (
    <section className="live-panel is-live" aria-live="polite">
      <div className="live-panel-head">
        <span className="status-chip">
          <span className="status-dot" />
          Live now
        </span>
        <span className="freq-tag">90.8 FM</span>
      </div>

      <p className="live-show">{now.program_name}</p>
      {now.episode_title && <p className="live-episode">{now.episode_title}</p>}

      <Waveform active bars={22} className="live-wave" label="Broadcast audio level" />

      <dl className="live-meta">
        {now.host_name && (
          <div>
            <dt>Host</dt>
            <dd>{now.host_name}</dd>
          </div>
        )}
        <div>
          <dt>On air</dt>
          <dd>
            {formatTime(now.start_time)} &ndash; {formatTime(now.end_time)}
          </dd>
        </div>
        {remaining && (
          <div>
            <dt>Remaining</dt>
            <dd>{remaining}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
