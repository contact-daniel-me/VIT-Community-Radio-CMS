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
  const repeats = chart.filter((s) => s.kind === 'REBROADCAST').length;

  const facts: { label: string; value: string }[] = [
    { label: 'Frequency', value: '90.8 MHz FM' },
    { label: 'Broadcasting from', value: 'VIT Vellore' },
  ];
  if (opens && closes) {
    facts.push({
      label: 'On air',
      value: `${formatSlotTime(opens.slice(0, 5))} to ${formatSlotTime(closes.slice(0, 5))}, Monday to Friday`,
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
          <p>
            VIT Community Radio broadcasts on <strong>90.8 MHz</strong> from VIT Vellore. It is a
            community radio station rather than a campus station: the programming is made by
            students, but it is made for everyone within listening distance &mdash; the campus,
            the neighbourhood and the wider Vellore community.
          </p>
          <p>
            The broadcast day follows a Fixed Point Chart, so listeners can find the same
            programmes at the same times each week. The morning band carries the day&rsquo;s new
            programming
            {repeats > 0 && (
              <>
                {' '}
                and is then repeated{' '}
                {repeats === 1 ? 'once' : repeats === 2 ? 'twice' : `${repeats} times`} through the
                afternoon and evening, so anyone who missed it still catches it
              </>
            )}
            . You can see the full chart under Schedule.
          </p>
          <p>
            Programmes run in Tamil and English across news, culture, knowledge, technology,
            campus life and music, and the roster grows as new voices join.
          </p>
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
              <p>Approved episodes are scheduled into the chart and go out on 90.8 MHz.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
