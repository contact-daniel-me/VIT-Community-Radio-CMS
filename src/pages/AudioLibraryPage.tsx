import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { Banner, Empty, Loading, PageHeader } from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { audioService } from '@/services/audioService';
import { episodeService, type EpisodeWithRelations } from '@/services/episodeService';
import type { AudioFileRow } from '@/types/database';
import { formatDateTime, formatDuration, formatFileSize } from '@/utils/datetime';

interface AudioLibraryItem {
  file: AudioFileRow;
  episode: EpisodeWithRelations | null;
  category: 'raw' | 'final';
  isOldTake: boolean;
}

function categorizeAudio(
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

interface AudioSectionProps {
  title: string;
  badge: string;
  badgeClass: string;
  items: AudioLibraryItem[];
  totalSize: number;
  searchActive: boolean;
  playing: string | null;
  onTogglePlay: (id: string) => void;
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
}: AudioSectionProps) {
  const playingItem = items.find((row) => row.file.id === playing);

  return (
    <section className="card">
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
            : `No ${title.toLowerCase()} uploaded yet.`}
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
                    <td className="small">{file.file_name}</td>
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
            <div style={{ marginTop: '0.8rem' }}>
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

type AudioFilter = 'all' | 'raw' | 'final';

export function AudioLibraryPage() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<AudioFilter>('all');

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

  const filteredLibrary = (library.data ?? []).filter(({ file, episode }) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return file.file_name.toLowerCase().includes(q) || (episode?.title || '').toLowerCase().includes(q);
  });

  const rawFiles = filteredLibrary.filter((item) => item.category === 'raw');
  const finalFiles = filteredLibrary.filter((item) => item.category === 'final');

  const rawTotal = rawFiles.reduce((sum, row) => sum + row.file.file_size, 0);
  const finalTotal = finalFiles.reduce((sum, row) => sum + row.file.file_size, 0);

  return (
    <>
      <PageHeader
        title="Audio library"
        description="Every audio file in the radio-audio bucket, with the episode it belongs to."
        actions={
          <div className="row align-center wrap" style={{ gap: '0.6rem' }}>
            <div className="row align-center" role="group" aria-label="Filter audio files by type" style={{ gap: '0.35rem' }}>
              <button
                type="button"
                className={`small ${filter === 'all' ? 'primary' : ''}`}
                onClick={() => setFilter('all')}
              >
                All files ({filteredLibrary.length})
              </button>
              <button
                type="button"
                className={`small ${filter === 'raw' ? 'primary' : ''}`}
                onClick={() => setFilter('raw')}
              >
                Raw files ({rawFiles.length})
              </button>
              <button
                type="button"
                className={`small ${filter === 'final' ? 'primary' : ''}`}
                onClick={() => setFilter('final')}
              >
                Final files ({finalFiles.length})
              </button>
            </div>
            <input 
              type="search" 
              placeholder="Search by file or episode title..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ minWidth: '220px' }}
            />
          </div>
        }
      />

      {library.loading ? (
        <Loading />
      ) : library.error ? (
        <Banner>{library.error}</Banner>
      ) : (library.data ?? []).length === 0 ? (
        <section className="card">
          <Empty>No audio has been uploaded yet.</Empty>
        </section>
      ) : filteredLibrary.length === 0 ? (
        <section className="card">
          <Empty>No results found for &ldquo;{searchQuery}&rdquo;.</Empty>
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
        </>
      )}
    </>
  );
}
