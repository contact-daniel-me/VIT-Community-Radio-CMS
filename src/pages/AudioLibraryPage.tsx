import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { Banner, Empty, Loading, PageHeader } from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { audioService } from '@/services/audioService';
import { episodeService } from '@/services/episodeService';
import { formatDateTime, formatDuration, formatFileSize } from '@/utils/datetime';

export function AudioLibraryPage() {
  const [playing, setPlaying] = useState<string | null>(null);

  const library = useAsync(async () => {
    const [files, episodes] = await Promise.all([
      audioService.listAudioLibrary(200),
      episodeService.getEpisodes({}),
    ]);
    const titles = new Map(episodes.map((e) => [e.id, e]));
    return files.map((file) => ({ file, episode: titles.get(file.episode_id) ?? null }));
  }, []);

  const total = (library.data ?? []).reduce((sum, row) => sum + row.file.file_size, 0);

  return (
    <>
      <PageHeader
        title="Audio library"
        description="Every audio file in the radio-audio bucket, with the episode it belongs to."
      />

      {library.loading ? (
        <Loading />
      ) : library.error ? (
        <Banner>{library.error}</Banner>
      ) : (library.data ?? []).length === 0 ? (
        <section className="card">
          <Empty>No audio has been uploaded yet.</Empty>
        </section>
      ) : (
        <section className="card">
          <div className="card-title">
            <h2>
              {(library.data ?? []).length} file{(library.data ?? []).length === 1 ? '' : 's'}
            </h2>
            <span className="small muted">{formatFileSize(total)} stored</span>
          </div>

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
                {(library.data ?? []).map(({ file, episode }) => (
                  <tr key={file.id}>
                    <td className="small">{file.file_name}</td>
                    <td>
                      {episode ? (
                        <Link to={`/episodes/${episode.id}`}>{episode.title}</Link>
                      ) : (
                        <span className="muted">--</span>
                      )}
                      {episode?.audio_file_id !== file.id && (
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
                        onClick={() => setPlaying(playing === file.id ? null : file.id)}
                      >
                        {playing === file.id ? 'Hide' : 'Play'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {playing && (
            <div style={{ marginTop: '0.8rem' }}>
              <AudioPlayer
                storagePath={
                  (library.data ?? []).find((row) => row.file.id === playing)?.file.storage_path
                }
              />
            </div>
          )}
        </section>
      )}
    </>
  );
}
