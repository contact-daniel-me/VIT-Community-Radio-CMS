import { useEffect, useState } from 'react';
import { publicService } from '@/services/publicService';
import type { PublicApprovedEpisodeRow } from '@/types/database';
import { useGlobalAudio } from '@/hooks/GlobalAudioContext';
import { useAuth } from '@/hooks/useAuth';

function formatDate(isoString: string) {
  const d = new Date(isoString);
  return d
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase(); // e.g. 11 SEP 2026
}

export function WhatsNew() {
  const [episodes, setEpisodes] = useState<PublicApprovedEpisodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const globalAudio = useGlobalAudio();
  const { profile } = useAuth();


  const navigateTo = (nextIndex: number) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex(nextIndex);
    setTimeout(() => setIsAnimating(false), 500);
  };

  const handleNext = () => {
    const nextIndex = (currentIndex + 1) % episodes.length;
    navigateTo(nextIndex);
  };

  const handlePrev = () => {
    const prevIndex = (currentIndex - 1 + episodes.length) % episodes.length;
    navigateTo(prevIndex);
  };

  const goToIndex = (index: number) => {
    if (index === currentIndex) return;
    navigateTo(index);
  };

  useEffect(() => {
    async function fetchEpisodes() {
      try {
        const approvedEpisodes = await publicService.getApprovedEpisodes();
        setEpisodes(approvedEpisodes);
      } catch (err) {
        console.error('Failed to fetch newest episodes for WhatsNew', err);
      } finally {
        setLoading(false);
      }
    }
    fetchEpisodes();
  }, []);

  // Autoplay timer — only advances the card, never plays audio
  useEffect(() => {
    if (isHovered || globalAudio.isPlaying || episodes.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % episodes.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [episodes.length, isHovered, globalAudio.isPlaying]);

  /**
   * Handles the play/pause button click.
   *
   * Logic:
   *  - If this episode is already the active track AND is playing → pause it.
   *  - If this episode is already the active track AND is paused → resume it.
   *  - Otherwise → load and play this episode fresh via globalAudio.playTrack.
   */
  const handlePlayPause = async (ep: PublicApprovedEpisodeRow) => {
    if (!profile) {
      setAuthMessage('Please sign in to listen to full episodes.');
      setTimeout(() => setAuthMessage(null), 3000);
      return;
    }
    const isThisTrackActive = globalAudio.currentTrack?.episode_id === ep.episode_id;

    if (isThisTrackActive) {
      if (globalAudio.isPlaying) {
        globalAudio.pause();
      } else {
        globalAudio.resume();
      }
      return;
    }

    // Cast: PublicApprovedEpisodeRow shares all fields that playTrack uses
    // (episode_id, storage_path, audio_duration_seconds, program_name, host_name, title)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalAudio.playTrack(ep as unknown as any);
  };

  if (loading) {
    return (
      <div className="whats-new-panel">
        <div className="whats-new-head">WHAT'S NEW</div>
        <div className="whats-new-subtitle">Loading...</div>
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="whats-new-panel">
        <div className="whats-new-head">WHAT'S NEW</div>
        <div className="whats-new-subtitle">No episodes available yet.</div>
      </div>
    );
  }

  return (
    <div
      className="whats-new-panel"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="whats-new-header-container">
        <h2 className="whats-new-head">WHAT'S NEW</h2>
        <p className="whats-new-subtitle">Catch the latest episodes from 90.8 FM</p>
      </div>

      <div className="whats-new-carousel-viewport">
        <div
          className="whats-new-carousel-track"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {episodes.map((ep, index) => {
            const isCurrent = globalAudio.currentTrack?.episode_id === ep.episode_id;
            const isPlaying = isCurrent && globalAudio.isPlaying;

            return (
              <div key={`${ep.episode_id}-${index}`} className="whats-new-slide">
                <div className="whats-new-card">
                  <div className="whats-new-card-badge">NEW</div>

                  <div className="whats-new-card-content">
                    <div className="whats-new-rj">{ep.host_name || 'VIT Radio'}</div>
                    <h3 className="whats-new-title">{ep.program_name}</h3>
                    <div className="whats-new-bottom">
                      <span className="whats-new-date">{formatDate(ep.created_at)}</span>
                      <button
                        type="button"
                        className="whats-new-play-btn"
                        aria-label={isPlaying ? 'Pause episode' : 'Play episode'}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handlePlayPause(ep);
                        }}
                      >
                        {isPlaying ? (
                          /* Pause icon */
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                            <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                          </svg>
                        ) : (
                          /* Play icon */
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.5-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {authMessage && (
        <div className="whats-new-auth-msg" style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--brand-red)', marginTop: '0.5rem', fontWeight: 500 }}>
          {authMessage}
        </div>
      )}

      <div className="whats-new-controls">
        <div className="whats-new-nav">
          {/* Previous button */}
          <button
            type="button"
            className="whats-new-nav-btn"
            onClick={handlePrev}
            aria-label="Previous episode"
            disabled={episodes.length <= 1}
            style={{ opacity: episodes.length <= 1 ? 0.5 : 1, cursor: episodes.length <= 1 ? 'default' : 'pointer' }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>

          <span className="whats-new-counter">
            {currentIndex + 1} / {Math.max(1, episodes.length)}
          </span>

          {/* Next button */}
          <button
            type="button"
            className="whats-new-nav-btn"
            onClick={handleNext}
            aria-label="Next episode"
            disabled={episodes.length <= 1}
            style={{ opacity: episodes.length <= 1 ? 0.5 : 1, cursor: episodes.length <= 1 ? 'default' : 'pointer' }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        </div>

        {episodes.length > 1 && (
          <div className="whats-new-pagination">
            {episodes.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`whats-new-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => goToIndex(index)}
                aria-label={`Go to episode ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
