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
