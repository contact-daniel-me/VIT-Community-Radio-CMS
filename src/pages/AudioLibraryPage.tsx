import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { Banner, Empty, Loading, PageHeader } from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { audioService } from '@/services/audioService';
import { episodeService, type EpisodeWithRelations } from '@/services/episodeService';
import type { AudioFileRow } from '@/types/database';
import { formatDateTime, formatDuration, formatFileSize } from '@/utils/datetime';

export interface AudioLibraryItem {
  file: AudioFileRow;
  episode: EpisodeWithRelations | null;
  category: 'raw' | 'final';
  isOldTake: boolean;
}

export function categorizeAudio(
  file: AudioFileRow,
  episode: EpisodeWithRelations | null,
): { category: 'raw' | 'final'; isOldTake: boolean } {
  if (episode) {
    if (episode.final_audio_file_id === file.id) {
      return { category: 'final', isOldTake: false };
    }
    if (episode.audio_file_id === file.id) {
      return { category: 'raw', isOldTake: false };
    }
    // File belongs to this episode but is not the active raw or final take
    const nameOrPath = `${file.file_name} ${file.storage_path}`.toLowerCase();
    if (nameOrPath.includes('final')) {
      return { category: 'final', isOldTake: true };
    }
    return { category: 'raw', isOldTake: true };
  }

  // File without a linked episode record
  const nameOrPath = `${file.file_name} ${file.storage_path}`.toLowerCase();
  if (nameOrPath.includes('final')) {
    return { category: 'final', isOldTake: false };
  }
  return { category: 'raw', isOldTake: false };
}

export type AudioFilterTab = 'all' | 'raw' | 'final' | 'old';

export interface AudioTabDef {
  key: AudioFilterTab;
  label: string;
}

export const AUDIO_TABS: AudioTabDef[] = [
  { key: 'all', label: 'All Audio' },
  { key: 'raw', label: 'Raw Audio' },
  { key: 'final', label: 'Final Audio' },
  { key: 'old', label: 'Old Takes' },
];

interface AudioSectionProps {
  title: string;
  badge: string;
  badgeClass: string;
  items: AudioLibraryItem[];
  totalSize: number;
  searchActive: boolean;
  playing: string | null;
  onTogglePlay: (id: string) => void;
  emptyFallback?: string;
}

function AudioSection({
  title,
  badge,
  badgeClass,
  items,
  totalSize,
  searchActive,
  playing,
  onTogglePlay,
  emptyFallback,
}: AudioSectionProps) {
  const playingItem = items.find((row) => row.file.id === playing);

  return (
    <section className="card" style={{ marginBottom: '1.25rem' }}>
      <div className="card-title">
        <div className="row align-center" style={{ gap: '0.6rem' }}>
          <h2>{title}</h2>
          <span className={`badge ${badgeClass}`}>{badge}</span>
          <span className="small muted">
            ({items.length} file{items.length === 1 ? '' : 's'})
          </span>
        </div>
        <span className="small muted">{formatFileSize(totalSize)} stored</span>
      </div>

      {items.length === 0 ? (
        <Empty>
          {searchActive
            ? `No ${title.toLowerCase()} match your search.`
            : emptyFallback || `No ${title.toLowerCase()} uploaded yet.`}
        </Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Episode</th>
                  <th>Length</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map(({ file, episode, isOldTake }) => (
                  <tr key={file.id}>
                    <td className="small" style={{ fontWeight: 500 }}>
                      {file.file_name}
                    </td>
                    <td>
                      {episode ? (
                        <Link to={`/admin/episodes/${episode.id}`}>{episode.title}</Link>
                      ) : (
                        <span className="muted">--</span>
                      )}
                      {isOldTake && (
                        <span className="badge badge-grey" style={{ marginLeft: '0.4rem' }}>
                          old take
                        </span>
                      )}
                    </td>
                    <td className="small">{formatDuration(file.duration_seconds)}</td>
                    <td className="small">{formatFileSize(file.file_size)}</td>
                    <td className="small muted">{formatDateTime(file.created_at)}</td>
                    <td className="actions">
                      <button
                        type="button"
                        className="small"
                        onClick={() => onTogglePlay(file.id)}
                      >
                        {playing === file.id ? 'Hide' : 'Play'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {playingItem && (
            <div style={{ marginTop: '0.8rem', padding: '0.8rem', background: 'var(--surface-sunken)', borderRadius: 'var(--r-md, 8px)' }}>
              <AudioPlayer
                storagePath={playingItem.file.storage_path}
                label={playingItem.file.file_name}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function AudioLibraryPage() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<AudioFilterTab>('all');

  const library = useAsync(async () => {
    const [files, episodes] = await Promise.all([
      audioService.listAudioLibrary(200),
      episodeService.getEpisodes({}),
    ]);
    const titles = new Map(episodes.map((e) => [e.id, e]));
    return files.map((file): AudioLibraryItem => {
      const episode = titles.get(file.episode_id) ?? null;
      const { category, isOldTake } = categorizeAudio(file, episode);
      return { file, episode, category, isOldTake };
    });
  }, []);

  const allItems = library.data ?? [];

  // Counts per tab across all library items
  const counts = useMemo(() => {
    return {
      all: allItems.length,
      raw: allItems.filter((i) => i.category === 'raw').length,
      final: allItems.filter((i) => i.category === 'final').length,
      old: allItems.filter((i) => i.isOldTake).length,
    };
  }, [allItems]);

  // Filter items by search query
  const filteredLibrary = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    const q = searchQuery.toLowerCase().trim();
    return allItems.filter(({ file, episode }) => {
      return (
        file.file_name.toLowerCase().includes(q) ||
        (episode?.title || '').toLowerCase().includes(q)
      );
    });
  }, [allItems, searchQuery]);

  const rawFiles = useMemo(
    () => filteredLibrary.filter((item) => item.category === 'raw'),
    [filteredLibrary],
  );
  const finalFiles = useMemo(
    () => filteredLibrary.filter((item) => item.category === 'final'),
    [filteredLibrary],
  );
  const oldFiles = useMemo(
    () => filteredLibrary.filter((item) => item.isOldTake),
    [filteredLibrary],
  );

  const rawTotal = useMemo(
    () => rawFiles.reduce((sum, row) => sum + row.file.file_size, 0),
    [rawFiles],
  );
  const finalTotal = useMemo(
    () => finalFiles.reduce((sum, row) => sum + row.file.file_size, 0),
    [finalFiles],
  );
  const oldTotal = useMemo(
    () => oldFiles.reduce((sum, row) => sum + row.file.file_size, 0),
    [oldFiles],
  );

  return (
    <>
      <PageHeader
        title="Audio Library"
        description="Every audio file in the radio-audio bucket, with the episode it belongs to."
      />

      {/* Tab Navigation and Search Bar */}
      <div
        className="row spread align-center wrap"
        style={{ gap: '1rem', marginBottom: '1.25rem' }}
      >
        <div
          className="tabs"
          role="tablist"
          aria-label="Filter audio files by category"
          style={{ margin: 0 }}
        >
          {AUDIO_TABS.map((tab) => {
            const isActive = filter === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={isActive}
                className={`tab ${isActive ? 'is-active' : ''}`}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
                <span className="tab-count">{counts[tab.key]}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: '1 1 260px', maxWidth: '380px' }}>
          <input
            type="search"
            placeholder="Search by file or episode title..."
            aria-label="Search audio files"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {library.loading ? (
        <Loading label="Loading audio library…" />
      ) : library.error ? (
        <Banner>{library.error}</Banner>
      ) : allItems.length === 0 ? (
        <section className="card">
          <Empty>No audio has been uploaded yet.</Empty>
        </section>
      ) : filteredLibrary.length === 0 ? (
        <section className="card">
          <Empty>No audio files found matching &ldquo;{searchQuery}&rdquo;.</Empty>
        </section>
      ) : (
        <>
          {(filter === 'all' || filter === 'raw') && (
            <AudioSection
              title="Raw Audio Files"
              badge="Raw Audio"
              badgeClass="badge-orange"
              items={rawFiles}
              totalSize={rawTotal}
              searchActive={Boolean(searchQuery.trim())}
              playing={playing}
              onTogglePlay={(id) => setPlaying((current) => (current === id ? null : id))}
            />
          )}

          {(filter === 'all' || filter === 'final') && (
            <AudioSection
              title="Final Audio Files"
              badge="Final Audio"
              badgeClass="badge-pink"
              items={finalFiles}
              totalSize={finalTotal}
              searchActive={Boolean(searchQuery.trim())}
              playing={playing}
              onTogglePlay={(id) => setPlaying((current) => (current === id ? null : id))}
            />
          )}

          {filter === 'old' && (
            <AudioSection
              title="Old Takes & Superseded Audio"
              badge="Old Takes"
              badgeClass="badge-grey"
              items={oldFiles}
              totalSize={oldTotal}
              searchActive={Boolean(searchQuery.trim())}
              playing={playing}
              onTogglePlay={(id) => setPlaying((current) => (current === id ? null : id))}
              emptyFallback="No old takes found. Previous takes are archived here when new audio is uploaded."
            />
          )}
        </>
      )}
    </>
  );
}
