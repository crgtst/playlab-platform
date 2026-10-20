import { useEffect } from 'react';
import { useBug } from '../context/ConfigContext';
import { useBattery } from '../lib/useBattery';

export const LOW_BATTERY = 0.2;

/** "Low battery: animations paused" when below 20% and not charging. Pauses CSS animations while shown. */
export function BatteryBanner() {
  // battery-banner-stuck: plugging in (chargingchange) is ignored, so the banner stays.
  const { supported, level, charging } = useBattery({ ignoreCharging: useBug('battery-banner-stuck') });
  const low = supported && level !== null && level < LOW_BATTERY && charging === false;

  useEffect(() => {
    document.documentElement.dataset.batterySaver = low ? 'on' : 'off';
  }, [low]);

  if (!low) return null;
  return (
    <div className="battery-banner" role="status" data-testid="battery-banner" data-level={level}>
      <span aria-hidden="true">🔋</span> Low battery: animations paused
    </div>
  );
}
