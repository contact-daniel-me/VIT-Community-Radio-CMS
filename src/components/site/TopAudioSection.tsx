import { useGlobalAudio } from '@/hooks/GlobalAudioContext';
import { audioService } from '@/services/audioService';
import type { PublicTopAudioRow } from '@/types/database';

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function TopAudioSection({ items }: { items: PublicTopAudioRow[] }) {
  const globalAudio = useGlobalAudio();

  const handleDownload = async (track: PublicTopAudioRow) => {
    try {
      const url = await audioService.getPlaybackUrl(track.storage_path);
      // Create temporary link to trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = track.file_name || `Episode_${track.episode_id}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  if (items.length === 0) {
    return (
      <section className="section top-audio-section" id="top-audio">
        <div className="section-head">
          <div>
            <p className="eyebrow">Top 10 Audio</p>
            <h2 className="section-title">Most popular episodes</h2>
          </div>
          <p className="section-note">Listen to the most popular audio from VIT Community Radio</p>
        </div>
        <div className="top-audio-empty">
          <p className="section-empty">No audio available yet</p>
          <p className="small muted">Check back soon for the latest VIT Community Radio programs.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section top-audio-section" id="top-audio">
      <div className="section-head">
        <div>
          <p className="eyebrow">Top 10 Audio</p>
          <h2 className="section-title">Most popular episodes</h2>
        </div>
        <p className="section-note">Listen to the most popular audio from VIT Community Radio</p>
      </div>

      <div className="top-audio-list">
        {items.map((track) => {
          const isCurrent = globalAudio.currentTrack?.episode_id === track.episode_id;
          const isPlaying = isCurrent && globalAudio.isPlaying;

          return (
            <div
              key={track.episode_id}
              className={`top-audio-item ${isCurrent ? 'is-active' : ''}`}
              onClick={() => {
                if (isCurrent) {
                  if (isPlaying) globalAudio.pause();
                  else globalAudio.resume();
                } else {
                  globalAudio.playTrack(track);
                }
              }}
            >
              <div className="top-audio-rank">#{track.display_order}</div>

              <div className="top-audio-content">
                <div className="top-audio-header">
                  <h3 className="top-audio-title">{track.title}</h3>
                  {isCurrent && (
                    <div className="top-audio-playing-indicator">
                      <span className="equalizer-bar" style={{ animationDelay: '0s' }}></span>
                      <span className="equalizer-bar" style={{ animationDelay: '0.2s' }}></span>
                      <span className="equalizer-bar" style={{ animationDelay: '0.4s' }}></span>
                    </div>
                  )}
                </div>
                <div className="top-audio-meta">
                  <span>{track.program_name}</span>
                  {track.host_name && (
                    <>
                      <span className="meta-separator">&middot;</span>
                      <span>{track.host_name}</span>
                    </>
                  )}
                  <span className="meta-separator">&middot;</span>
                  <span>{new Date(track.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span className="meta-separator">&middot;</span>
                  <span>{clock(track.audio_duration_seconds || track.duration_seconds || 0)}</span>
                </div>
                
                {isCurrent && (
                   <div className="top-audio-progress-container" onClick={(e) => {
                     e.stopPropagation();
                     const bounds = e.currentTarget.getBoundingClientRect();
                     const x = Math.max(0, Math.min(e.clientX - bounds.left, bounds.width));
                     const p = x / bounds.width;
                     globalAudio.seek(p * globalAudio.duration);
                   }}>
                     <div className="top-audio-progress-bar">
                       <div className="top-audio-progress-fill" style={{ width: `${globalAudio.progress * 100}%` }}></div>
                     </div>
                   </div>
                )}
              </div>

              <div className="top-audio-actions">
                <button
                  type="button"
                  className="top-audio-btn play-btn"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" width="24" height="24">
                      <path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24">
                      <path fill="currentColor" d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.5-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="top-audio-btn download-btn"
                  aria-label="Download Audio"
                  title="Download Audio"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDownload(track);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
