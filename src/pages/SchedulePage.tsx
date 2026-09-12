import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import {
  Banner,
  ConfirmButton,
  Empty,
  Loading,
  PageHeader,
  ScheduleStatusBadge,
} from '@/components/ui';
import { scheduleService } from '@/services/scheduleService';
import { programService } from '@/services/programService';
import { episodeService } from '@/services/episodeService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import {
  formatDate,
  formatTime,
  isoToStationLocal,
  stationDay,
  stationLocalToIso,
} from '@/utils/datetime';
import type { ScheduleDetailsRow } from '@/types/database';

export function SchedulePage() {
  const profile = useCurrentUser();
  const canSchedule = can.schedule(profile.role);

  const [day, setDay] = useState(stationDay());
  const daySchedule = useAsync(() => scheduleService.getTodaySchedule(day), [day]);
  const upcoming = useAsync(() => scheduleService.getUpcoming(8), []);
  const programs = useAsync(() => programService.getPrograms({ activeOnly: true }), []);

  const [programId, setProgramId] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleDetailsRow[]>([]);

  const approved = useAsync(
    () => (programId ? episodeService.getSchedulableEpisodes(programId) : Promise.resolve([])),
    [programId],
  );

  const selectedProgram = (programs.data ?? []).find((p) => p.id === programId);

  // Default the end time from the programme's usual slot length.
  useEffect(() => {
    if (!startLocal || !selectedProgram) return;
    const start = new Date(stationLocalToIso(startLocal));
    const end = new Date(start.getTime() + selectedProgram.default_duration_minutes * 60000);
    setEndLocal(isoToStationLocal(end.toISOString()));
  }, [startLocal, selectedProgram]);

  // Warn about a clash before submitting. The database still decides.
  //
  // `showForm` is a dependency on purpose. Re-opening the form keeps the times
  // from last time, so typing the same values changes no state and would leave
  // a stale (empty) conflict list from before that slot existed -- the form
  // would look clear while the database was certain to reject it.
  useEffect(() => {
    if (!showForm || !startLocal || !endLocal) {
      setConflicts([]);
      return;
    }
    let active = true;
    scheduleService
      .findConflicts(stationLocalToIso(startLocal), stationLocalToIso(endLocal))
      .then((rows) => active && setConflicts(rows))
      .catch(() => active && setConflicts([]));
    return () => {
      active = false;
    };
  }, [startLocal, endLocal, showForm]);

  // Opening the form starts a clean slot rather than inheriting the last one.
  const toggleForm = () => {
    if (showForm) {
      setShowForm(false);
      return;
    }
    setEpisodeId('');
    setStartLocal('');
    setEndLocal('');
    setNotes('');
    setConflicts([]);
    setError(null);
    setShowForm(true);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!programId || !startLocal || !endLocal) {
      setError('Choose a program and both times.');
      return;
    }

    setBusy(true);
    try {
      await scheduleService.createSchedule({
        program_id: programId,
        episode_id: episodeId || null,
        start_time: stationLocalToIso(startLocal),
        end_time: stationLocalToIso(endLocal),
        notes: notes || null,
      });
      setNotice('Slot added to the schedule.');
      setShowForm(false);
      setEpisodeId('');
      setNotes('');
      await Promise.all([daySchedule.reload(), upcoming.reload()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setError(null);
    try {
      await scheduleService.cancelSchedule(id, 'Cancelled from the schedule page');
      setNotice('Slot cancelled.');
      await Promise.all([daySchedule.reload(), upcoming.reload()]);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const shiftDay = (days: number) => {
    const next = new Date(`${day}T12:00:00+05:30`);
    next.setDate(next.getDate() + days);
    setDay(stationDay(next));
  };

  return (
    <>
      <PageHeader
        title="Schedule"
        description="The broadcast grid, in station time (IST). Only QC-approved episodes can be booked."
        actions={
          canSchedule && (
            <button type="button" className="primary" onClick={toggleForm}>
              {showForm ? 'Close' : 'New slot'}
            </button>
          )
        }
      />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      {showForm && canSchedule && (
        <form className="card" onSubmit={create}>
          <h2>New slot</h2>
          <div className="form-grid cols-2">
            <div>
              <label htmlFor="s-program">Program</label>
              <select
                id="s-program"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  setEpisodeId('');
                }}
                required
              >
                <option value="">Choose a program</option>
                {(programs.data ?? []).map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="s-episode">
                Episode{' '}
                <span className="hint">
                  {selectedProgram?.requires_audio === false
                    ? '(leave empty for a live show)'
                    : '(approved only)'}
                </span>
              </label>
              <select
                id="s-episode"
                value={episodeId}
                onChange={(e) => setEpisodeId(e.target.value)}
                disabled={!programId || approved.loading}
              >
                <option value="">Live show / no episode</option>
                {(approved.data ?? []).map((episode) => (
                  <option key={episode.id} value={episode.id}>
                    {episode.title}
                    {episode.episode_number ? ` (#${episode.episode_number})` : ''}
                  </option>
                ))}
              </select>
              {programId && !approved.loading && (approved.data ?? []).length === 0 && (
                <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                  No approved episodes for this program yet.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="s-start">Starts (IST)</label>
              <input
                id="s-start"
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="s-end">Ends (IST)</label>
              <input
                id="s-end"
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                required
              />
            </div>

            <div className="span-2">
              <label htmlFor="s-notes">Notes</label>
              <input
                id="s-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
              />
            </div>
          </div>

          {conflicts.length > 0 && (
            <Banner kind="error">
              This clashes with{' '}
              {conflicts
                .map((c) => `${c.program_name} (${formatTime(c.start_time)}-${formatTime(c.end_time)})`)
                .join(', ')}
              . Pick another time.
            </Banner>
          )}

          <div className="actions-row">
            <button type="submit" className="primary" disabled={busy || conflicts.length > 0}>
              {busy ? 'Saving...' : 'Add slot'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="card-title">
          <h2>{day === stationDay() ? 'Today' : formatDate(`${day}T12:00:00+05:30`)}</h2>
          <div className="row">
            <button type="button" className="small" onClick={() => shiftDay(-1)}>
              &larr; Previous
            </button>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              aria-label="Schedule day"
              style={{ width: 'auto' }}
            />
            <button type="button" className="small" onClick={() => shiftDay(1)}>
              Next &rarr;
            </button>
          </div>
        </div>

        {daySchedule.loading ? (
          <Loading />
        ) : daySchedule.error ? (
          <Banner>{daySchedule.error}</Banner>
        ) : (daySchedule.data ?? []).length === 0 ? (
          <Empty>Nothing scheduled on this day.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Program</th>
                  <th>Episode</th>
                  <th>Host</th>
                  <th>Status</th>
                  {canSchedule && <th />}
                </tr>
              </thead>
              <tbody>
                {(daySchedule.data ?? []).map((slot) => (
                  <tr key={slot.id}>
                    <td>
                      {formatTime(slot.start_time)}
                      <span className="muted"> - {formatTime(slot.end_time)}</span>
                    </td>
                    <td>{slot.program_name}</td>
                    <td>
                      {slot.episode_id ? (
                        <Link to={`/admin/episodes/${slot.episode_id}`}>{slot.episode_title}</Link>
                      ) : (
                        <span className="muted">Live show</span>
                      )}
                    </td>
                    <td>{slot.host_name ?? '--'}</td>
                    <td>
                      <ScheduleStatusBadge status={slot.status} />
                    </td>
                    {canSchedule && (
                      <td className="actions">
                        {(slot.status === 'SCHEDULED' || slot.status === 'ON_AIR') && (
                          <ConfirmButton
                            className="small"
                            confirmLabel="Cancel it?"
                            onConfirm={() => void cancel(slot.id)}
                          >
                            Cancel
                          </ConfirmButton>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Coming up</h2>
        {upcoming.loading ? (
          <Loading />
        ) : (upcoming.data ?? []).length === 0 ? (
          <Empty>Nothing scheduled ahead.</Empty>
        ) : (
          <div className="stack">
            {(upcoming.data ?? []).map((slot) => (
              <div key={slot.id} className="list-item row spread">
                <span>
                  <strong>{slot.program_name}</strong>{' '}
                  <span className="muted small">
                    {slot.episode_title ?? 'Live show'}
                  </span>
                </span>
                <span className="small muted">
                  {formatDate(slot.start_time)} &middot; {formatTime(slot.start_time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
