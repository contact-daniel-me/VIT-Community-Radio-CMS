/**
 * A slow, quiet waveform.
 *
 * The bar heights are a fixed, hand-tuned sequence rather than random or
 * mathematically even — a generated pattern reads as decoration, an uneven one
 * reads like signal. Animation is CSS-only and stops entirely under
 * prefers-reduced-motion (see tokens.css).
 */
const BARS = [
  0.28, 0.52, 0.34, 0.78, 0.46, 0.9, 0.62, 0.4, 0.72, 0.3, 0.58, 0.86, 0.44,
  0.66, 0.36, 0.8, 0.5, 0.26, 0.68, 0.42, 0.74, 0.32, 0.6, 0.88, 0.38,
];

export function Waveform({
  active = false,
  bars = BARS.length,
  className = '',
  label,
}: {
  active?: boolean;
  bars?: number;
  className?: string;
  label?: string;
}) {
  const slice = BARS.slice(0, bars);

  return (
    <div
      className={`waveform ${active ? 'is-active' : ''} ${className}`.trim()}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {slice.map((height, index) => (
        <span
          key={index}
          className="waveform-bar"
          style={{
            height: `${Math.round(height * 100)}%`,
            // Offsets are staggered but not uniform, so the motion never looks
            // like a marching sine wave.
            animationDelay: `${(index % 7) * 110 + (index % 3) * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}
