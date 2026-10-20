import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AppConfig } from '../api/types';

const ConfigContext = createContext<AppConfig | null>(null);

/** Runtime settings from GET /api/v1/config (payment frame URL, whether test hooks are on). */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    api<AppConfig>('/config')
      .then(setConfig)
      .catch(() => setConfig({ paymentFrameUrl: '', testHooks: false }));
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

/** Null until the config has loaded. */
export function useConfig(): AppConfig | null {
  return useContext(ConfigContext);
}
