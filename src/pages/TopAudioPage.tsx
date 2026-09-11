import { useState, useEffect } from 'react';
import { PageHeader, Banner, Loading } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { topAudioService } from '@/services/topAudioService';
import { episodeService } from '@/services/episodeService';
import type { HomepageFeaturedAudioRow } from '@/types/database';

export function TopAudioPage() {
  const { data: featuredRows, loading: loadingFeatured, reload: reloadFeatured } = useAsync(
    () => topAudioService.getAdminTopAudio(),
    []
  );

  const { data: episodes, loading: loadingEpisodes } = useAsync(
    () => episodeService.getEpisodes({ status: ['APPROVED', 'ARCHIVED'], limit: 100 }),
    []
  );

  const [localRows, setLocalRows] = useState<HomepageFeaturedAudioRow[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (featuredRows) {
      setLocalRows([...featuredRows].sort((a, b) => a.display_order - b.display_order));
    }
  }, [featuredRows]);

  if (loadingFeatured || loadingEpisodes) {
    return <Loading label="Loading Top 10 configuration..." />;
  }

  const handleAdd = async () => {
    if (!selectedEpisode) return;
    if (localRows.find((r) => r.episode_id === selectedEpisode)) {
      setError('Episode is already in the featured list.');
      return;
    }
    if (localRows.length >= 10) {
      setError('You can only have up to 10 featured items.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const newOrder = localRows.length + 1;
      await topAudioService.addTopAudio(selectedEpisode, newOrder);
      await reloadFeatured();
      setSelectedEpisode('');
    } catch (err: any) {
      setError(err.message || 'Failed to add episode');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (episodeId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await topAudioService.removeTopAudio(episodeId);
      await reloadFeatured();
    } catch (err: any) {
      setError(err.message || 'Failed to remove episode');
    } finally {
      setIsSaving(false);
    }
  };

  const moveRow = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === localRows.length - 1) return;

    const newRows = [...localRows];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Swap display orders
    const tempOrder = newRows[index].display_order;
    newRows[index].display_order = newRows[targetIndex].display_order;
    newRows[targetIndex].display_order = tempOrder;

    // Actually swap elements in array so UI updates correctly
    const tempRow = newRows[index];
    newRows[index] = newRows[targetIndex];
    newRows[targetIndex] = tempRow;

    setLocalRows(newRows);
    
    setIsSaving(true);
    setError(null);
    try {
      await topAudioService.updateOrder([
        { id: newRows[index].id, episode_id: newRows[index].episode_id, display_order: newRows[index].display_order },
        { id: newRows[targetIndex].id, episode_id: newRows[targetIndex].episode_id, display_order: newRows[targetIndex].display_order },
      ]);
      await reloadFeatured();
    } catch (err: any) {
      setError(err.message || 'Failed to reorder');
      // revert on fail
      if (featuredRows) {
         setLocalRows([...featuredRows].sort((a, b) => a.display_order - b.display_order));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page content-narrow">
      <PageHeader
        title="Top 10 Audio"
        description="Curate the featured audio tracks that appear on the public homepage."
      />

      {error && <Banner kind="error">{error}</Banner>}

      <div className="card">
        <h3>Add to Top 10</h3>
        <p className="small muted mb-4">
          Select an approved or archived episode. The list is limited to 10 items.
        </p>
        <div className="field-row">
          <select
            className="input"
            value={selectedEpisode}
            onChange={(e) => setSelectedEpisode(e.target.value)}
            disabled={isSaving || localRows.length >= 10}
          >
            <option value="">Select an episode...</option>
            {episodes?.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.program?.name} - {ep.title}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() => void handleAdd()}
            disabled={!selectedEpisode || isSaving || localRows.length >= 10}
          >
            Add
          </button>
        </div>
      </div>

      <div className="card mt-4">
        <h3>Current Top 10</h3>
        {localRows.length === 0 ? (
          <p className="small muted">No featured audio configured yet.</p>
        ) : (
          <ul className="list-bare" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {localRows.map((row, index) => {
              const ep = episodes?.find((e) => e.id === row.episode_id);
              return (
                <li
                  key={row.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ fontWeight: 'bold', width: '2rem', textAlign: 'center' }}>
                      #{index + 1}
                    </div>
                    <div>
                      <strong>{ep?.title || 'Unknown Title'}</strong>
                      <div className="small muted">
                        {ep?.program?.name || 'Unknown Program'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-outline small"
                      disabled={index === 0 || isSaving}
                      onClick={() => void moveRow(index, 'up')}
                      aria-label="Move Up"
                    >
                      &uarr;
                    </button>
                    <button
                      className="btn btn-outline small"
                      disabled={index === localRows.length - 1 || isSaving}
                      onClick={() => void moveRow(index, 'down')}
                      aria-label="Move Down"
                    >
                      &darr;
                    </button>
                    <button
                      className="btn btn-outline small"
                      style={{ color: 'var(--red)' }}
                      disabled={isSaving}
                      onClick={() => void handleRemove(row.episode_id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
