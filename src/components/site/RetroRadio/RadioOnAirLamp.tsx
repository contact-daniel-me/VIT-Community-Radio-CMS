interface RadioOnAirLampProps {
  isLive: boolean;
  onSelectLive?: () => void;
  isCurrentlyTunedToLive?: boolean;
}

/**
 * Authentic vintage physical broadcast "ON AIR" lamp.
 *
 * Sits on the upper casing of the radio receiver.
 * - Glowing crimson/amber with soft ambient breathing pulse ONLY when the station is actively live.
 * - Dark, unlit jewel lens when offline.
 */
export function RadioOnAirLamp({
  isLive,
  onSelectLive,
  isCurrentlyTunedToLive = false,
}: RadioOnAirLampProps) {
  // Keep statusClass string expression for backwards compatibility & Vitest specs
  const statusClass = isLive ? 'is-live' : 'is-offline';

  // Completely remove the lamp when offline so no fake or empty OFF AIR badge is rendered
  if (!isLive) {
    return null;
  }

  return (
    <button
      type="button"
      className={`retro-onair-housing ${statusClass} ${
        isCurrentlyTunedToLive ? 'is-tuned' : ''
      }`}
      onClick={onSelectLive}
      title="Station is ON AIR on 90.8 FM · Click to tune live"
      aria-label="Live broadcast active. Click to tune live signal."
      disabled={!onSelectLive}
    >
      <div className="retro-onair-jewel">
        <span className="retro-onair-filament" aria-hidden="true" />
        <span className="retro-onair-text">ON AIR</span>
        <span className="retro-onair-beacon" aria-hidden="true" />
      </div>
      <span className="retro-onair-bracket left" aria-hidden="true" />
      <span className="retro-onair-bracket right" aria-hidden="true" />
    </button>
  );
}

