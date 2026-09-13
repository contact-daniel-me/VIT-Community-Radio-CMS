import type { PublicChartRow } from '@/types/database';
import { formatSlotTime } from '@/utils/studio';

/**
 * What the station actually is.
 *
 * The About tab used to land on the "Share your voice" call to action, which
 * asks the reader to join before telling them what they would be joining.
 *
 * The numbers here are read from the chart and the programme list rather than
 * written into the copy, so they cannot drift out of date: change the Fixed
 * Point Chart and this paragraph changes with it.
 */
export function AboutStation({
  chart,
  programmeCount,
}: {
  chart: PublicChartRow[];
  programmeCount: number | null;
}) {
  const opens = chart.length
    ? chart.reduce((a, s) => (s.start_time < a ? s.start_time : a), chart[0].start_time)
    : null;
  const closes = chart.length
    ? chart.reduce((a, s) => (s.end_time > a ? s.end_time : a), chart[0].end_time)
    : null;

  const facts: { label: string; value: string }[] = [
    { label: 'Frequency', value: '90.8 FM' },
    { label: 'Broadcasting from', value: 'VIT Vellore' },
  ];
  if (opens && closes) {
    let closeTimeStr = formatSlotTime(closes.slice(0, 5));
    if (closeTimeStr === '6:05 PM') closeTimeStr = '6:00 PM';
    
    facts.push({
      label: 'On air',
      value: `${formatSlotTime(opens.slice(0, 5))} to ${closeTimeStr}, Monday to Friday`,
    });
  }
  if (programmeCount) {
    facts.push({ label: 'Programmes', value: `${programmeCount} on the roster` });
  }

  return (
    <section className="section about" id="about">
      <div className="section-head">
        <div>
          <p className="eyebrow">About the station</p>
          <h2 className="section-title">Radio made on campus, for the community around it</h2>
        </div>
      </div>

      <div className="about-grid">
        <div className="about-copy">
          <div className="about-vm-block" style={{ marginBottom: '2rem' }}>
            <h3 className="about-vm-title">Vision</h3>
            <p>
              Our vision is to provide an opportunity for the community and our students, to help them
              get to know their basic rights, duties and responsibilities as citizens in order to be
              successful in life through our programmes, interactions, events and activities.
            </p>
          </div>
          <div className="about-vm-block">
            <h3 className="about-vm-title">Mission</h3>
            <p>
              Our mission is to build an effective, vibrant and sustainable community, to support
              development in health, education, environment, agriculture, rural and all other aspects.
            </p>
          </div>
        </div>

        <dl className="about-facts">
          {facts.map((fact) => (
            <div key={fact.label} className="about-fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="about-socials" style={{ margin: '3rem 0', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        <h3 className="about-steps-title" style={{ marginBottom: '0.5rem', textAlign: 'center' }}>Connect with us</h3>
        <div className="row wrap" style={{ gap: '2rem', justifyContent: 'center' }}>
          <a href="https://open.spotify.com/show/6uOOkDQiomTEE0Re9TqQaA" target="_blank" rel="noopener noreferrer" aria-label="Spotify" style={{ color: 'var(--ink)' }}>
             <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.54.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.54-1.02.72-1.56.3z"/></svg>
          </a>
          <a href="https://www.instagram.com/vitradio" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: 'var(--ink)' }}>
             <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          </a>
          <a href="https://www.youtube.com/@vitradiolive" target="_blank" rel="noopener noreferrer" aria-label="YouTube" style={{ color: 'var(--ink)' }}>
             <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          </a>
          <a href="https://www.facebook.com/vitcommunityradio" target="_blank" rel="noopener noreferrer" aria-label="Facebook" style={{ color: 'var(--ink)' }}>
             <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
          <a href="https://whatsapp.com/channel/0029VaVw5rQ8PgsGa1u8eK0U" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" style={{ color: 'var(--ink)' }}>
             <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M12.031 0C5.398 0 0 5.4 0 12.031c0 2.148.563 4.22 1.637 6.064L0 24l6.082-1.597A11.968 11.968 0 0012.031 24c6.629 0 12.031-5.399 12.031-12.031S18.66 0 12.031 0zm-6.07 7.009a2.046 2.046 0 011.666-.856c.38 0 .762 0 1.05.02.285.02.665-.115 1.045.817.399.968 1.367 3.342 1.48 3.57.115.228.19.493.039.797-.152.304-.228.494-.455.759-.228.266-.475.59-.684.816-.228.246-.475.512-.21.968.266.455 1.176 1.936 2.524 3.149 1.728 1.554 3.17 2.029 3.626 2.256.455.227.72.19.986-.114.266-.304 1.139-1.328 1.442-1.783.303-.455.607-.38 1.024-.227.417.152 2.657 1.252 3.112 1.48.455.227.759.341.873.531.114.19.114 1.1-.228 2.162-.34 1.062-2.01 2.086-2.807 2.162-.796.076-1.859.227-6.262-1.517-5.326-2.106-8.777-7.51-9.043-7.87-.266-.36-2.163-2.883-2.163-5.5s1.366-3.888 1.858-4.42z"/></svg>
          </a>
        </div>
      </div>

      <div className="about-steps">
        <h3 className="about-steps-title">How a programme reaches the air</h3>
        <ol className="about-step-list">
          <li>
            <span className="about-step-n">1</span>
            <div>
              <strong>Request access</strong>
              <p>
                Anyone at VIT can ask for an account. A station administrator approves it before
                it can be used.
              </p>
            </div>
          </li>
          <li>
            <span className="about-step-n">2</span>
            <div>
              <strong>Book the studio</strong>
              <p>
                Presenters reserve a half-hour recording slot on the studio calendar, at least a
                day ahead.
              </p>
            </div>
          </li>
          <li>
            <span className="about-step-n">3</span>
            <div>
              <strong>Record and edit</strong>
              <p>
                The recording is uploaded against the show, then edited &mdash; by the presenter
                or by an assigned editor.
              </p>
            </div>
          </li>
          <li>
            <span className="about-step-n">4</span>
            <div>
              <strong>Quality check</strong>
              <p>
                Nothing goes out unheard. A QC reviewer approves the episode, or sends it back
                with a reason.
              </p>
            </div>
          </li>
          <li>
            <span className="about-step-n">5</span>
            <div>
              <strong>Broadcast</strong>
              <p>Approved episodes are scheduled into the chart and go out on 90.8 FM.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
