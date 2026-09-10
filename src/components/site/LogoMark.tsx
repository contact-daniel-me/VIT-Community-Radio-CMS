/**
 * The station mark, drawn as SVG.
 *
 * This is a REPRODUCTION of the VIT Community Radio mic mark, not the original
 * artwork: a capsule microphone with V / I / T stacked inside, on a stem and
 * base. It exists so the header is never empty.
 *
 * The real file takes priority — drop the supplied artwork at
 * public/brand/vit-community-radio.png and <Logo> uses that instead; this is
 * only what renders when the file is absent.
 *
 * Why it is drawn rather than embedded: the brand navy disappears against the
 * CMS's near-black header, so the mark reads `--logo-ink`, which flips to white
 * on dark surfaces. A flat bitmap cannot do that.
 *
 * The wordmark is deliberately NOT reproduced. Its rounded display face cannot
 * be matched with a web font, and a near-miss looks worse than clean type, so
 * <Logo> sets the station name in the UI typeface beside this mark.
 */
export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 160"
      width={(size / 160) * 100}
      height={size}
      className={`logo-svg ${className}`.trim()}
      role="img"
      aria-label="VIT Community Radio"
    >
      {/* capsule */}
      <rect x="22" y="2" width="56" height="118" rx="28" fill="var(--logo-ink)" />

      {/* V */}
      <path
        d="M37.5 22 L45 22 L50 38.5 L55 22 L62.5 22 L53.5 50 L46.5 50 Z"
        fill="var(--logo-paper)"
      />

      {/* I — serif form, as in the mark */}
      <g fill="var(--logo-paper)">
        <rect x="40.5" y="57" width="19" height="5.6" />
        <rect x="46.8" y="57" width="6.4" height="27" />
        <rect x="40.5" y="78.4" width="19" height="5.6" />
      </g>

      {/* T */}
      <g fill="var(--logo-paper)">
        <rect x="39.5" y="91" width="21" height="5.8" />
        <rect x="46.8" y="91" width="6.4" height="29" />
      </g>

      {/* stem + base */}
      <rect x="44" y="119" width="12" height="28" fill="var(--logo-ink)" />
      <rect x="31" y="145" width="38" height="11" rx="5.5" fill="var(--logo-ink)" />
    </svg>
  );
}
