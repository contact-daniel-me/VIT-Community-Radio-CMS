import { useGlobalAudio } from '@/hooks/GlobalAudioContext';
import type { SharedScheduledEpisode } from '@/types/database';

interface SharedEpisodeHighlightProps {
  episode: SharedScheduledEpisode;
  onTuneOnRadio?: () => void;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s > 0 ? `${s}s` : ''}`.trim();
}

function formatScheduleDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Available on 90.8 FM';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Available on 90.8 FM';
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' (IST)';
  } catch {
    return 'Available on 90.8 FM';
  }
}

export function SharedEpisodeHighlight({
  episode,
  onTuneOnRadio,
}: SharedEpisodeHighlightProps) {
  const globalAudio = useGlobalAudio();

  const isCurrentTrack =
    globalAudio.currentTrack?.episode_id === episode.episode_id;
  const isPlaying = isCurrentTrack && globalAudio.isPlaying;

  const handleTogglePlay = () => {
    if (isCurrentTrack) {
      if (isPlaying) {
        globalAudio.pause();
      } else {
        globalAudio.resume();
      }
    } else {
      // Play final QC-approved audio
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalAudio.playTrack({
        id: episode.episode_id,
        episode_id: episode.episode_id,
        title: episode.title,
        host_name: episode.host_name,
        program_name: episode.program_name,
        storage_path: episode.storage_path,
        storage_provider: episode.storage_provider,
        audio_duration_seconds: episode.duration_seconds,
      } as any);
    }
  };

  const handleTune = () => {
    if (onTuneOnRadio) {
      onTuneOnRadio();
    } else {
      const radioEl = document.querySelector('.retro-radio-wrapper') || document.getElementById('main');
      radioEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <section
      className="shared-episode-banner"
      aria-label="Shared scheduled episode details"
      style={{
        margin: '1.5rem auto',
        maxWidth: '720px',
        padding: '1.25rem 1.5rem',
        background: 'linear-gradient(135deg, #FBF9F4 0%, #F2EDE2 100%)',
        border: '1.5px solid #D6CEBE',
        borderRadius: '10px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Header Badge Strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: '#805000',
              color: '#FFFFFF',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.5px',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#4ade80',
              }}
            />
            Shared Episode
          </span>
          <span
            style={{
              fontSize: '0.76rem',
              color: '#555',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {episode.program_category}
          </span>
        </div>

        <span
          style={{
            fontSize: '0.78rem',
            color: '#444',
            fontWeight: 600,
            fontFamily: 'monospace',
          }}
        >
          {formatScheduleDateTime(episode.scheduled_at)}
        </span>
      </div>

      {/* Main Episode Content */}
      <div style={{ marginBottom: '1rem' }}>
        <p
          style={{
            margin: '0 0 0.25rem',
            fontSize: '0.86rem',
            color: '#805000',
            fontWeight: 700,
          }}
        >
          {episode.program_name} · Hosted by {episode.host_name}
        </p>
        <h2
          style={{
            margin: '0 0 0.5rem',
            fontSize: '1.45rem',
            fontWeight: 800,
            color: '#1a1a1a',
            lineHeight: 1.25,
          }}
        >
          {episode.title}
        </h2>
        {episode.description && (
          <p
            style={{
              margin: '0 0 0.5rem',
              fontSize: '0.92rem',
              lineHeight: 1.5,
              color: '#3d3d3d',
            }}
          >
            {episode.description}
          </p>
        )}
        {episode.duration_seconds ? (
          <span
            style={{
              fontSize: '0.76rem',
              color: '#666',
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            Duration: {formatDuration(episode.duration_seconds)}
          </span>
        ) : null}
      </div>

      {/* Action Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          paddingTop: '0.75rem',
          borderTop: '1px solid #E2DBCF',
        }}
      >
        <button
          type="button"
          onClick={handleTogglePlay}
          className="btn btn-shared-play"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: isPlaying ? '#222' : 'var(--radio-play-btn, #D91F2B)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '0.55rem 1.15rem',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
            transition: 'background 0.15s ease',
          }}
        >
          {isPlaying ? (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              </svg>
              <span>Pause Audio</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.5-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z"
                />
              </svg>
              <span>Listen to Final Audio</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleTune}
          className="btn btn-outline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.55rem 1rem',
            fontSize: '0.88rem',
            fontWeight: 600,
            border: '1.5px solid #B0A795',
            borderRadius: '6px',
            background: '#F5F0E6',
            color: '#333',
            cursor: 'pointer',
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3.24 6.15C2.51 6.43 2 7.17 2 8v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H8.3l7.26-2.9-1.2-1.95L3.24 6.15zM4 9h16v11H4V9zm8 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
            />
          </svg>
          <span>Tuned on 90.8 FM Radio</span>
        </button>
      </div>
    </section>
  );
}
