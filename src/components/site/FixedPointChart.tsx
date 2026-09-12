import type { PublicChartRow, SlotKind } from '@/types/database';
import { formatSlotTime } from '@/utils/studio';

/**
 * The Fixed Point Chart, as published.
 *
 * This is the shape of the broadcast day every week, which is different from
 * the day's line-up above it: that one is what is actually booked to go out
 * today and is empty until someone schedules it. The chart is true regardless,
 * so the Schedule tab always has something real to show.
 *
 * Rows are drawn in the order the view returns them, which is the order they
 * appear on the printed chart. The Campus Quiz deliberately sits inside
 * Rebroadcast II -- the chart nests, which is why station_slots has no overlap
 * constraint -- so nesting is shown rather than corrected.
 */
const KIND_LABEL: Record<SlotKind, string> = {
  ANNOUNCEMENT: 'Announcement',
  SEGMENT: 'Segment',
  ROTATING_BLOCK: 'Rotating',
  REBROADCAST: 'Rebroadcast',
  FEATURE: 'Feature',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** [1,2,3,4,5] -> 'Monday to Friday'. Any other set is listed short. */
function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const runsMonToFri =
    sorted.length === 5 && sorted.every((d, i) => d === i + 1);
  if (runsMonToFri) return 'Monday to Friday';
  if (sorted.length === 7) return 'Every day';
  return sorted.map((d) => DAY_NAMES[d]?.slice(0, 3) ?? '').join(', ');
}

export function FixedPointChart({ slots }: { slots: PublicChartRow[] }) {
  if (slots.length === 0) {
    return <p className="section-empty">The weekly chart has not been published yet.</p>;
  }

  // Every row currently runs Monday to Friday. Stated once above the table
  // rather than repeated on all thirteen rows, unless a row differs.
  const dayLabels = new Set(slots.map((s) => describeDays(s.days)));
  const sharedDays = dayLabels.size === 1 ? [...dayLabels][0] : null;

  // The broadcast day, read off the chart rather than written down here, so it
  // stays true if the chart changes.
  const opens = slots.reduce((a, s) => (s.start_time < a ? s.start_time : a), slots[0].start_time);
  const closes = slots.reduce((a, s) => (s.end_time > a ? s.end_time : a), slots[0].end_time);
  const effectiveFrom = slots[0].effective_from;

  return (
    <div className="chart">
      <p className="chart-caption">
        {sharedDays ?? 'Weekly'} &middot; {formatSlotTime(opens.slice(0, 5))} to{' '}
        {formatSlotTime(closes.slice(0, 5))}
        {effectiveFrom && (
          <>
            <span className="chart-dot">&middot;</span>
            with effect from{' '}
            {new Intl.DateTimeFormat('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(new Date(`${effectiveFrom}T12:00:00`))}
          </>
        )}
      </p>

      <div className="chart-scroll">
        <table className="chart-table">
          <caption className="visually-hidden">
            The Fixed Point Chart for VIT Community Radio 90.8 FM
          </caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Programme</th>
              <th scope="col">Kind</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id} className={`chart-row kind-${slot.kind.toLowerCase()}`}>
                <td className="chart-time">
                  <time>{formatSlotTime(slot.start_time.slice(0, 5))}</time>
                  <span className="chart-dash">&ndash;</span>
                  <time>{formatSlotTime(slot.end_time.slice(0, 5))}</time>
                  {!sharedDays && <span className="chart-days">{describeDays(slot.days)}</span>}
                </td>
                <td>
                  <span className="chart-title">{slot.title}</span>
                  {slot.notes && <span className="chart-note">{slot.notes}</span>}
                </td>
                <td>
                  <span className="chart-kind">{KIND_LABEL[slot.kind]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
