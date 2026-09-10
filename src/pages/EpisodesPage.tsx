import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, Empty, EpisodeStatusBadge, Loading, PageHeader } from '@/components/ui';
import { episodeService, type EpisodeInput } from '@/services/episodeService';
import { programService } from '@/services/programService';
import { userService } from '@/services/userService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDuration } from '@/utils/datetime';
import type { EpisodeStatus } from '@/types/database';

const STATUSES: EpisodeStatus[] = ['DRAFT', 'PENDING_QC', 'APPROVED', 'REJECTED', 'ARCHIVED'];

export function EpisodesPage() {
  const profile = useCurrentUser();
  const [params, setParams] = useSearchParams();

  const programFilter = params.get('program') ?? '';
  const statusFilter = (params.get('status') ?? '') as EpisodeStatus | '';
  const mineOnly = params.get('mine') === '1';
  const search = params.get('q') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const programs = useAsync(() => programService.getPrograms(), []);
  const rjs = useAsync(() => userService.getActiveUsersByRole('RJ'), []);

  const episodes = useAsync(
    () =>
      episodeService.getEpisodes({
        programId: programFilter || undefined,
        status: statusFilter || undefined,
        mineOnly: mineOnly ? profile.id : undefined,
        search: search || undefined,
      }),
    [programFilter, statusFilter, mineOnly, search, profile.id],
  );

  const [form, setForm] = useState<EpisodeInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePrograms = (programs.data ?? []).filter((p) => p.active);

  const openCreate = () => {
    setError(null);
    setForm({
      program_id: programFilter || activePrograms[0]?.id || '',
      title: '',
      description: '',
      episode_number: null,
      host_name: profile.role === 'RJ' ? profile.full_name : '',
      assigned_rj: profile.role === 'RJ' ? profile.id : null,
    });
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    if (!form.program_id) {
      setError('Choose the programme this episode belongs to.');
      return;
    }
    if (form.title.trim().length < 2) {
      setError('Give the episode a title.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await episodeService.createEpisode(form, profile.id);
      setForm(null);
      await episodes.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Episodes"
        description="Create a draft, attach the audio, then send it to QC."
        actions={
          can.createEpisode(profile.role) && (
            <button
              type="button"
              className="primary"
              onClick={openCreate}
              disabled={activePrograms.length === 0}
            >
              New episode
            </button>
          )
        }
      />

      <Banner>{error}</Banner>
      {activePrograms.length === 0 && !programs.loading && (
        <Banner kind="info">
          There are no active programs yet. Create one under <Link to="/programs">Programs</Link>{' '}
          before adding episodes.
        </Banner>
      )}

      {form && (
        <form className="card" onSubmit={create}>
          <h2>New episode</h2>
          <div className="form-grid cols-2">
            <div>
              <label htmlFor="program">Program</label>
              <select
                id="program"
                value={form.program_id}
                onChange={(e) => setForm({ ...form, program_id: e.target.value })}
                required
              >
                <option value="">Choose a program</option>
                {activePrograms.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor="number">
                Episode number <span className="hint">(optional)</span>
              </label>
              <input
                id="number"
                type="number"
                min={1}
                value={form.episode_number ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    episode_number: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div>
              <label htmlFor="hostname">Host on this episode</label>
              <input
                id="hostname"
                value={form.host_name ?? ''}
                onChange={(e) => setForm({ ...form, host_name: e.target.value })}
                maxLength={120}
              />
            </div>
            {profile.role !== 'RJ' && (
              <div>
                <label htmlFor="assigned">
                  Assign to RJ <span className="hint">(optional)</span>
                </label>
                <select
                  id="assigned"
                  value={form.assigned_rj ?? ''}
                  onChange={(e) => setForm({ ...form, assigned_rj: e.target.value || null })}
                >
                  <option value="">Nobody yet</option>
                  {(rjs.data ?? []).map((rj) => (
                    <option key={rj.id} value={rj.id}>
                      {rj.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="span-2">
              <label htmlFor="desc">Description</label>
              <textarea
                id="desc"
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={4000}
              />
            </div>
          </div>

          <div className="actions-row">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create draft'}
            </button>
            <button type="button" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="filters">
          <input
            type="search"
            placeholder="Search titles"
            value={search}
            onChange={(e) => setParam('q', e.target.value)}
            aria-label="Search episodes"
          />
          <select
            value={programFilter}
            onChange={(e) => setParam('program', e.target.value)}
            aria-label="Filter by program"
          >
            <option value="">All programs</option>
            {(programs.data ?? []).map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setParam('status', e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setParam('mine', e.target.checked ? '1' : '')}
            />
            Only mine
          </label>
        </div>

        {episodes.loading ? (
          <Loading />
        ) : episodes.error ? (
          <Banner>{episodes.error}</Banner>
        ) : (episodes.data ?? []).length === 0 ? (
          <Empty>No episodes match these filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Episode</th>
                  <th>Program</th>
                  <th>Host</th>
                  <th>Audio</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {(episodes.data ?? []).map((episode) => (
                  <tr key={episode.id}>
                    <td>
                      <Link to={`/episodes/${episode.id}`}>{episode.title}</Link>
                      {episode.episode_number && (
                        <span className="muted small"> #{episode.episode_number}</span>
                      )}
                    </td>
                    <td>{episode.program?.name ?? '--'}</td>
                    <td>{episode.host_name ?? episode.assignee?.full_name ?? '--'}</td>
                    <td className="small">
                      {episode.audio_file
                        ? formatDuration(
                            episode.audio_file.duration_seconds ?? episode.duration_seconds,
                          )
                        : <span className="muted">None</span>}
                    </td>
                    <td>
                      <EpisodeStatusBadge status={episode.status} />
                    </td>
                    <td className="small muted">{formatDate(episode.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
