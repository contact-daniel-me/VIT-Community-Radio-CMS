import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/CommunityCTA';
import { YouTubeLive } from '@/components/site/YouTubeLive';
import { CHANNEL_URL } from '@/services/youtubeService';

/**
 * The YouTube Live tab: the station's daily video broadcast.
 *
 * Publicly reachable and signed out by design -- this is for listeners, not
 * for the station. Which broadcast is showing is worked out by the server on
 * every visit, so a new stream each morning needs nobody to touch the site.
 */
export function YouTubeLivePage() {
  return (
    <div className="site">
      <SiteHeader />

      <main id="main">
        <section className="studio-hero">
          <p className="eyebrow">
            <span>Live on YouTube</span>
            <span className="eyebrow-rule" />
            <span>90.8 MHz</span>
          </p>
          <h1 className="studio-hero-title">Watch the station live.</h1>
          <p className="studio-hero-copy">
            VIT Community Radio streams its broadcast on YouTube. Whatever is on air appears
            here automatically &mdash; there is nothing to look up and no link to chase.
          </p>
        </section>

        <section className="section" id="youtube-live">
          <div className="section-head">
            <div>
              <p className="eyebrow">Today&rsquo;s broadcast</p>
              <h2 className="section-title">VIT Community Radio Live</h2>
            </div>
            <p className="section-note">Checked automatically, every minute</p>
          </div>

          <YouTubeLive />

          <p className="small muted yt-foot">
            Broadcasts are published on the station&rsquo;s official channel,{' '}
            <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer">
              @vitradiolive
            </a>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
