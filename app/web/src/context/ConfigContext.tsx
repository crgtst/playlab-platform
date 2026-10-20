import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AppConfig } from '../api/types';

const ConfigContext = createContext<AppConfig | null>(null);

const FALLBACK: AppConfig = { paymentFrameUrl: '', testHooks: false, currencies: { EUR: 1, GBP: 0.85 }, bugs: [] };

/**
 * Runtime settings from GET /api/v1/config (payment frame URL, currency rates, active bug-mode defects).
 * The app renders once they have loaded, so bug-mode behaviour applies from the first paint.
 */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    api<AppConfig>('/config')
      .then((c) => setConfig({ ...FALLBACK, ...c }))
      .catch(() => setConfig(FALLBACK));
  }, []);

  if (!config) return null;
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useConfig(): AppConfig {
  return useContext(ConfigContext) ?? FALLBACK;
}

/** True when a bug-mode defect is switched on (TEST_HOOKS only). */
export function useBug(name: string): boolean {
  return useConfig().bugs.includes(name);
}
