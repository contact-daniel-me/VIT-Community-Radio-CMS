import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, ConfirmButton, Empty, Loading, PageHeader } from '@/components/ui';
import { NextUpCard, OnAirCard } from '@/components/OnAirCard';
import { AudioPlayer } from '@/components/AudioPlayer';
import { broadcastService } from '@/services/broadcastService';
import { scheduleService } from '@/services/scheduleService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { formatTime } from '@/utils/datetime';

export function LivePage() {
  const profile = useCurrentUser();
  const operator = can.goLive(profile.role);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const live = useAsync(async () => {
    await broadcastService.syncBroadcastState().catch(() => undefined);
    const [snapshot, today] = await Promise.all([
      broadcastService.getSnapshot(),
      scheduleService.getTodaySchedule(),
    ]);
    return { snapshot, today };
  }, []);

  const act = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      await live.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (live.loading) return <Loading />;
  if (live.error) return <Banner>{live.error}</Banner>;
  if (!live.data) return null;

  const { snapshot, today } = live.data;
  const onAir = snapshot.current?.broadcast_status === 'ON_AIR';
  const startable = today.filter((slot) => slot.status === 'SCHEDULED');

  return (
    <>
      <PageHeader
        title="On air"
        description="What the station is playing right now. This is the CMS record of the broadcast, not a streaming encoder."
        actions={
          <button type="button" className="small" onClick={() => void live.reload()}>
            Refresh
          </button>
        }
      />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      <div className="grid grid-2">
        <OnAirCard current={snapshot.current} />
        <NextUpCard next={snapshot.next} />
      </div>

      {onAir && snapshot.current && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div className="card-title">
            <h2>Now playing</h2>
            {operator && (
              <ConfirmButton
                className="small"
                confirmLabel="End broadcast?"
                disabled={busy}
                onConfirm={() =>
                  void act(
                    () => broadcastService.endBroadcast(),
                    'Broadcast ended and the slot marked complete.',
                  )
                }
              >
                End broadcast
              </ConfirmButton>
            )}
          </div>
          <p className="small muted">
            {snapshot.current.episode_title ?? 'Live show'} &middot; on air since{' '}
            {formatTime(snapshot.current.started_at)} &middot; slot ends{' '}
            {formatTime(snapshot.current.end_time)}
          </p>
          <AudioPlayer storagePath={snapshot.current.audio_storage_path} />
        </section>
      )}

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Today&rsquo;s slots</h2>
        {today.length === 0 ? (
          <Empty>
            Nothing is scheduled today. Add a slot on the <Link to="/schedule">Schedule</Link>{' '}
            page.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Program</th>
                  <th>Episode</th>
                  <th>Status</th>
                  {operator && <th />}
                </tr>
              </thead>
              <tbody>
                {today.map((slot) => (
                  <tr key={slot.id}>
                    <td>
                      {formatTime(slot.start_time)}
                      <span className="muted"> - {formatTime(slot.end_time)}</span>
                    </td>
                    <td>{slot.program_name}</td>
                    <td>{slot.episode_title ?? <span className="muted">Live show</span>}</td>
                    <td className="small">{slot.status.replace('_', ' ')}</td>
                    {operator && (
                      <td className="actions">
                        {slot.status === 'SCHEDULED' && (
                          <button
                            type="button"
                            className="small primary"
                            disabled={busy || onAir}
                            title={onAir ? 'End the current broadcast first' : undefined}
                            onClick={() =>
                              void act(
                                () => broadcastService.startBroadcast(slot.id),
                                `${slot.program_name} is now on air.`,
                              )
                            }
                          >
                            Go live
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {operator && !onAir && startable.length === 0 && today.length > 0 && (
          <p className="small muted">Every slot for today has already been aired or cancelled.</p>
        )}
      </section>
    </>
  );
}
