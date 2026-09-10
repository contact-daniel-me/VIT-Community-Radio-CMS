import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, ConfirmButton, Empty, Loading, PageHeader } from '@/components/ui';
import { programService, type ProgramInput } from '@/services/programService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import type { ProgramRow } from '@/types/database';

const BLANK: ProgramInput = {
  name: '',
  description: '',
  host_name: '',
  category: 'GENERAL',
  default_duration_minutes: 30,
  requires_audio: true,
};

export function ProgramsPage() {
  const profile = useCurrentUser();
  const editable = can.manageProgram(profile.role);

  const [showInactive, setShowInactive] = useState(false);
  const programs = useAsync(() => programService.getPrograms(), []);

  const [editing, setEditing] = useState<ProgramRow | null>(null);
  const [form, setForm] = useState<ProgramInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK });
    setError(null);
  };

  const openEdit = (program: ProgramRow) => {
    setEditing(program);
    setForm({
      name: program.name,
      description: program.description ?? '',
      host_name: program.host_name ?? '',
      category: program.category,
      default_duration_minutes: program.default_duration_minutes,
      requires_audio: program.requires_audio,
    });
    setError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    if (form.name.trim().length < 2) {
      setError('Give the programme a name of at least two characters.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await programService.updateProgram(editing.id, form);
        setNotice(`Saved "${form.name}".`);
      } else {
        await programService.createProgram(form, profile.id);
        setNotice(`Created "${form.name}".`);
      }
      setForm(null);
      setEditing(null);
      await programs.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (program: ProgramRow) => {
    setError(null);
    try {
      await programService.setProgramActive(program.id, !program.active);
      setNotice(
        program.active
          ? `"${program.name}" deactivated. It keeps its episodes and history.`
          : `"${program.name}" is active again.`,
      );
      await programs.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const visible = (programs.data ?? []).filter((p) => showInactive || p.active);

  return (
    <>
      <PageHeader
        title="Programs"
        description="Radio shows. Deactivate instead of deleting, so episodes and history stay intact."
        actions={
          editable && (
            <button type="button" className="primary" onClick={openCreate}>
              New program
            </button>
          )
        }
      />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      {form && (
        <form className="card" onSubmit={save}>
          <h2>{editing ? `Edit ${editing.name}` : 'New program'}</h2>
          <div className="form-grid cols-2">
            <div>
              <label htmlFor="name">Name</label>
              <input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="host">Regular host</label>
              <input
                id="host"
                value={form.host_name ?? ''}
                onChange={(e) => setForm({ ...form, host_name: e.target.value })}
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="category">Category</label>
              <input
                id="category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
                maxLength={40}
              />
            </div>
            <div>
              <label htmlFor="duration">
                Default slot length <span className="hint">(minutes)</span>
              </label>
              <input
                id="duration"
                type="number"
                min={5}
                max={360}
                value={form.default_duration_minutes}
                onChange={(e) =>
                  setForm({ ...form, default_duration_minutes: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="span-2">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={2000}
              />
            </div>
            <div className="span-2 checkbox">
              <input
                id="requires_audio"
                type="checkbox"
                checked={form.requires_audio}
                onChange={(e) => setForm({ ...form, requires_audio: e.target.checked })}
              />
              <label htmlFor="requires_audio" style={{ margin: 0 }}>
                Episodes need an audio file before QC and scheduling
                <span className="hint"> (turn off for live shows)</span>
              </label>
            </div>
          </div>

          <div className="actions-row">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save program'}
            </button>
            <button type="button" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="card-title">
          <h2>{visible.length} program{visible.length === 1 ? '' : 's'}</h2>
          <label className="checkbox" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        {programs.loading ? (
          <Loading />
        ) : programs.error ? (
          <Banner>{programs.error}</Banner>
        ) : visible.length === 0 ? (
          <Empty>No programs yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Host</th>
                  <th>Slot</th>
                  <th>Audio</th>
                  <th>Status</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {visible.map((program) => (
                  <tr key={program.id}>
                    <td>
                      <Link to={`/episodes?program=${program.id}`}>{program.name}</Link>
                      {program.description && (
                        <p className="small muted" style={{ margin: '0.15rem 0 0' }}>
                          {program.description.slice(0, 90)}
                          {program.description.length > 90 ? '...' : ''}
                        </p>
                      )}
                    </td>
                    <td>{program.category}</td>
                    <td>{program.host_name ?? '--'}</td>
                    <td>{program.default_duration_minutes} min</td>
                    <td className="small">{program.requires_audio ? 'Required' : 'Live OK'}</td>
                    <td>
                      <span className={`badge ${program.active ? 'badge-green' : 'badge-grey'}`}>
                        {program.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {editable && (
                      <td className="actions">
                        <button
                          type="button"
                          className="small"
                          onClick={() => openEdit(program)}
                        >
                          Edit
                        </button>{' '}
                        <ConfirmButton
                          className="small"
                          confirmLabel={program.active ? 'Deactivate?' : 'Activate?'}
                          onConfirm={() => void toggleActive(program)}
                        >
                          {program.active ? 'Deactivate' : 'Activate'}
                        </ConfirmButton>
                      </td>
                    )}
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
