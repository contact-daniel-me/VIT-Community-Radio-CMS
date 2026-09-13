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
             <svg role="img" viewBox="0 0 24 24" width="28" height="28" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>Spotify</title><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.54.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.54-1.02.72-1.56.3z"/></svg>
          </a>
          <a href="https://www.instagram.com/vitradio" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: 'var(--ink)' }}>
             <svg role="img" viewBox="0 0 24 24" width="28" height="28" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>Instagram</title><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.93 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.863.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>
          </a>
          <a href="https://www.youtube.com/@vitradiolive" target="_blank" rel="noopener noreferrer" aria-label="YouTube" style={{ color: 'var(--ink)' }}>
             <svg role="img" viewBox="0 0 24 24" width="28" height="28" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>YouTube</title><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          </a>
          <a href="https://www.facebook.com/vitcommunityradio" target="_blank" rel="noopener noreferrer" aria-label="Facebook" style={{ color: 'var(--ink)' }}>
             <svg role="img" viewBox="0 0 24 24" width="28" height="28" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>Facebook</title><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.114.198v3.425c-.283-.05-.896-.11-1.332-.11-1.92 0-2.433.87-2.433 2.37v1.572h3.94l-.621 3.667h-3.319v8.324h-4.675z"/></svg>
          </a>
          <a href="https://whatsapp.com/channel/0029VaVw5rQ8PgsGa1u8eK0U" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" style={{ color: 'var(--ink)' }}>
             <svg role="img" viewBox="0 0 24 24" width="28" height="28" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>WhatsApp</title><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
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
