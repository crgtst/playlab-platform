import { useEffect, useState } from 'react';

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

export interface BatteryState {
  supported: boolean;
  level: number | null;
  charging: boolean | null;
}

/**
 * Battery Status API (Chromium only). Missing elsewhere, so tests usually mock navigator.getBattery
 * with page.addInitScript. `ignoreCharging` is the battery-banner-stuck defect.
 */
export function useBattery({ ignoreCharging = false } = {}): BatteryState {
  const [state, setState] = useState<BatteryState>({ supported: false, level: null, charging: null });

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    if (typeof nav.getBattery !== 'function') return;
    let battery: BatteryManagerLike | null = null;
    let cancelled = false;
    const onLevel = () => battery && setState((s) => ({ ...s, level: battery!.level }));
    const onCharging = () => battery && setState((s) => ({ ...s, charging: battery!.charging }));
    nav
      .getBattery()
      .then((b) => {
        if (cancelled) return;
        battery = b;
        setState({ supported: true, level: b.level, charging: b.charging });
        b.addEventListener('levelchange', onLevel);
        if (!ignoreCharging) b.addEventListener('chargingchange', onCharging);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      battery?.removeEventListener('levelchange', onLevel);
      battery?.removeEventListener('chargingchange', onCharging);
    };
  }, [ignoreCharging]);

  return state;
}
