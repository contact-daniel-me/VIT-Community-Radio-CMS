import { useEffect } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { youtubeService, CHANNEL_URL, type LiveStatus } from '@/services/youtubeService';

/**
 * The station's YouTube broadcast.
 *
 * Which video is playing is never written down here. The serverless route
 * decides that from the channel's own uploads, so a new broadcast each morning
 * needs nobody to edit the site.
 *
 * It re-checks every minute, which matches the edge cache on the route: a
 * broadcast appears within about a minute of going live, and a page left open
 * all day does not need reloading. Polling stops while the tab is hidden --
 * a backgrounded tab has nobody to show the result to.
 */
const POLL_MS = 60_000;

function WatchLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    // Outline, not ghost: these sit on a white card where a borderless button
    // reads as loose bold text rather than something to press.
    <a className="btn btn-outline" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function Player({ videoId, title }: { videoId: string; title: string }) {
  return (
    <div className="yt-frame">
      <iframe
        // youtube-nocookie keeps the visitor out of YouTube's ad cookies until
        // they actually press play.
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(at);
}

export function YouTubeLive() {
  const status = useAsync<LiveStatus>(() => youtubeService.getLiveStatus(), []);
  const { reload } = status;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [reload]);

  const data = status.data;
  const channelUrl = data?.channelUrl ?? CHANNEL_URL;

  // Only the very first load shows a skeleton. Later polls keep the current
  // state on screen, so a live player is never replaced by a spinner.
  if (status.loading && !data) {
    return (
      <div className="yt" aria-busy="true">
        <div className="yt-skeleton" role="status">
          <span className="visually-hidden">Checking whether the station is live&hellip;</span>
        </div>
      </div>
    );
  }

  if (status.error && !data) {
    return (
      <div className="yt">
        <div className="yt-state yt-state-error" role="status">
          <p className="yt-state-title">We could not check the broadcast</p>
          <p className="yt-state-text">{status.error}</p>
          <div className="yt-actions">
            <button type="button" className="btn btn-solid" onClick={() => void status.reload()}>
              Try again
            </button>
            <WatchLink href={channelUrl}>Open the channel</WatchLink>
          </div>
        </div>
      </div>
    );
  }

  if (data?.state === 'live') {
    return (
      <div className="yt">
        <p className="yt-badge yt-badge-live" role="status">
          <span className="yt-dot" aria-hidden="true" />
          LIVE NOW
        </p>
        <h3 className="yt-title">{data.title}</h3>
        <Player videoId={data.videoId} title={`${data.title} — live on YouTube`} />
        <div className="yt-actions">
          <WatchLink href={`https://www.youtube.com/watch?v=${data.videoId}`}>
            Watch on YouTube
          </WatchLink>
        </div>
      </div>
    );
  }

  if (data?.state === 'upcoming') {
    const when = formatWhen(data.scheduledStartTime);
    return (
      <div className="yt">
        <p className="yt-badge yt-badge-soon" role="status">
          SCHEDULED
        </p>
        <h3 className="yt-title">{data.title}</h3>
        <div className="yt-state">
          <p className="yt-state-text">
            {when ? `Starts ${when} (IST).` : 'A broadcast is scheduled.'} The player appears here
            once it begins.
          </p>
          <div className="yt-actions">
            <WatchLink href={`https://www.youtube.com/watch?v=${data.videoId}`}>
              Set a reminder on YouTube
            </WatchLink>
          </div>
        </div>
      </div>
    );
  }

  // Offline. No iframe at all rather than an embed that would show an error.
  return (
    <div className="yt">
      <p className="yt-badge" role="status">
        OFF AIR
      </p>
      <div className="yt-state">
        <p className="yt-state-title">Currently offline</p>
        <p className="yt-state-text">
          There is no live broadcast on YouTube right now. This page checks by itself, so leave it
          open and the stream will appear when the station goes on air.
        </p>
        <div className="yt-actions">
          <WatchLink href={channelUrl}>Visit the YouTube channel</WatchLink>
        </div>
      </div>
    </div>
  );
}
