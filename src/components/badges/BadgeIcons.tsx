import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 48): SVGProps<SVGSVGElement> => ({
  viewBox: '0 0 48 48',
  width: size,
  height: size,
  fill: 'none',
  'aria-hidden': true,
});

/** Microphone — Mic Drop, Station Voice, Voice Of VIT */
export function MicIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="16" y="8" width="16" height="24" rx="8" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" className="badge-icon-shape" />
      <path d="M8 28c0 8.837 7.163 14 16 14s16-5.163 16-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-icon-wave" />
      <line x1="24" y1="42" x2="24" y2="48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="18" y1="48" x2="30" y2="48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="20" r="3" fill="currentColor" className="badge-icon-dot" />
    </svg>
  );
}

/** Clock / Slot — Slot Locked, Frequency Familiar */
export function ClockIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="3" className="badge-icon-shape" />
      <polyline points="24,14 24,24 31,31" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="badge-icon-wave" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
    </svg>
  );
}

/** Waveform — Sound Check */
export function WaveformIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <line x1="4" y1="24" x2="4" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-bar bar-1" />
      <line x1="10" y1="18" x2="10" y2="30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-bar bar-2" />
      <line x1="16" y1="12" x2="16" y2="36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-bar bar-3" />
      <line x1="22" y1="6" x2="22" y2="42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-bar bar-4" />
      <line x1="28" y1="10" x2="28" y2="38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-bar bar-5" />
      <line x1="34" y1="16" x2="34" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-bar bar-6" />
      <line x1="40" y1="20" x2="40" y2="28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-bar bar-7" />
      <line x1="46" y1="24" x2="46" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-bar bar-8" />
    </svg>
  );
}

/** Script lines — Scripted */
export function ScriptIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="10" y="6" width="28" height="36" rx="4" stroke="currentColor" strokeWidth="3" className="badge-icon-shape" />
      <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="badge-line line-1" />
      <line x1="16" y1="22" x2="32" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="badge-line line-2" />
      <line x1="16" y1="28" x2="26" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="badge-line line-3" />
      <line x1="16" y1="34" x2="29" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="badge-line line-4" />
    </svg>
  );
}

/** Signal bars — Green Light, Request Line */
export function SignalIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="4" y="34" width="7" height="10" rx="2" fill="currentColor" className="badge-signal-bar bar-1" />
      <rect x="15" y="26" width="7" height="18" rx="2" fill="currentColor" className="badge-signal-bar bar-2" />
      <rect x="26" y="18" width="7" height="26" rx="2" fill="currentColor" className="badge-signal-bar bar-3" />
      <rect x="37" y="8" width="7" height="36" rx="2" fill="currentColor" className="badge-signal-bar bar-4" />
      <circle cx="8" cy="30" r="3" fill="var(--ok)" className="badge-green-dot" />
    </svg>
  );
}

/** Frequency tuner — Tuned In */
export function TunerIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <line x1="6" y1="24" x2="42" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="badge-icon-shape" />
      {[10, 16, 22, 28, 34, 40].map((x, i) => (
        <line key={x} x1={x} y1="20" x2={x} y2={i === 3 ? "10" : "28"} stroke="currentColor" strokeWidth={i === 3 ? "3" : "2"} strokeLinecap="round" className={`badge-tick ${i === 3 ? 'active-tick' : ''}`} />
      ))}
      <circle cx="28" cy="24" r="5" stroke="currentColor" strokeWidth="3" fill="none" className="badge-tuner-needle" />
    </svg>
  );
}

/** ON AIR indicator — First Broadcast */
export function OnAirIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="24" cy="24" r="8" fill="currentColor" className="badge-onair-dot" />
      <path d="M10 38c-4-4-6-9-6-14s2-10 6-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" className="badge-wave wave-left-1" />
      <path d="M6 42C1 37-1 31-1 24s2-13 7-18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" className="badge-wave wave-left-2" />
      <path d="M38 10c4 4 6 9 6 14s-2 10-6 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" className="badge-wave wave-right-1" />
      <path d="M42 6c5 5 7 11 7 18s-2 13-7 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" className="badge-wave wave-right-2" />
    </svg>
  );
}

/** Rising waveform — Voice Rising */
export function RisingIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <polyline points="4,44 12,36 20,28 28,18 36,10 44,4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" className="badge-rising-line" />
      <polyline points="34,4 44,4 44,14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" className="badge-rising-arrow" />
      <circle cx="12" cy="36" r="2" fill="currentColor" className="badge-rising-dot dot-1" />
      <circle cx="24" cy="24" r="2" fill="currentColor" className="badge-rising-dot dot-2" />
      <circle cx="36" cy="12" r="2" fill="currentColor" className="badge-rising-dot dot-3" />
    </svg>
  );
}

/** Radio waves — First Frequency, Frequency Hunter */
export function FrequencyIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="24" cy="24" r="4" fill="currentColor" className="badge-freq-center" />
      <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2.5" fill="none" strokeDasharray="4 4" className="badge-freq-ring ring-1" />
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="4 6" className="badge-freq-ring ring-2" />
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="3 8" className="badge-freq-ring ring-3" />
    </svg>
  );
}

/** Flame — On A Roll */
export function FireIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M24 44c-8 0-14-6-14-14 0-6 4-12 6-14-1 4 2 8 4 8 0-6 4-14 10-20 0 6 4 10 6 14 2-2 2-6 1-8 4 6 5 12 5 14 0 8-6 20-18 20z" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="round" className="badge-flame" />
      <path d="M22 36c-3 0-5-2.5-5-5.5 0-2.5 1.5-5 2.5-5.5 0 2 1 3.5 2 3.5 0-2.5 1.5-5.5 3.5-7 0 2 1.5 3.5 2 5 1-1 1-2.5 1-3 1.5 2.5 2 4.5 2 5.5 0 3-2 7-8 7z" fill="currentColor" className="badge-flame-inner" />
    </svg>
  );
}

/** Broadcast tower — Campus Shout, Radio Devotion */
export function BroadcastIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <line x1="24" y1="18" x2="24" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="16" y1="46" x2="32" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="20" y1="38" x2="24" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="28" y1="38" x2="24" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 22c-4 4-6 8-6 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" className="badge-broadcast-wave w1" />
      <path d="M8 16C2 22-1 29-1 35" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" className="badge-broadcast-wave w2" />
      <path d="M34 22c4 4 6 8 6 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" className="badge-broadcast-wave w3" />
      <path d="M40 16c6 6 9 13 9 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" className="badge-broadcast-wave w4" />
      <circle cx="24" cy="15" r="3" fill="currentColor" className="badge-broadcast-top" />
    </svg>
  );
}

/** Lock — Locked To The Frequency */
export function LockIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="10" y="22" width="28" height="22" rx="4" stroke="currentColor" strokeWidth="3" className="badge-lock-body" />
      <path d="M14 22v-6a10 10 0 0120 0v6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" className="badge-lock-shackle" />
      <circle cx="24" cy="33" r="3" stroke="currentColor" strokeWidth="2.5" fill="none" className="badge-lock-key" />
      <line x1="24" y1="36" x2="24" y2="40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="badge-lock-key-line" />
    </svg>
  );
}

/** Star crown — Radio Legend */
export function LegendIcon({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <polygon points="24,4 29,18 44,18 32,27 37,42 24,33 11,42 16,27 4,18 19,18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="round" className="badge-legend-star" />
      <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="2" fill="none" className="badge-legend-center" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x = 24 + 10 * Math.cos(rad);
        const y = 24 + 10 * Math.sin(rad);
        return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="1.5" fill="currentColor" className={`badge-particle p-${i}`} />;
      })}
    </svg>
  );
}

/** Small generic lock for locked badge overlay */
export function SmallLockIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" {...rest}>
      <rect x="4" y="11" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}

export const BADGE_ICON_MAP: Record<string, React.ComponentType<IconProps>> = {
  mic: MicIcon,
  clock: ClockIcon,
  waveform: WaveformIcon,
  script: ScriptIcon,
  signal: SignalIcon,
  tuner: TunerIcon,
  onair: OnAirIcon,
  rising: RisingIcon,
  frequency: FrequencyIcon,
  fire: FireIcon,
  broadcast: BroadcastIcon,
  lock: LockIcon,
  legend: LegendIcon,
};
