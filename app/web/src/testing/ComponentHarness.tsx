import { Fragment, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Currency } from '../api/types';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { StaticConfigProvider } from '../context/ConfigContext';
import { PrefsProvider, Theme } from '../context/PrefsContext';
import { RealtimeProvider } from '../context/RealtimeContext';
import { ToastProvider } from '../context/ToastContext';
import { WishlistProvider } from '../context/WishlistContext';
import type { Lang } from '../lib/i18n';

/** Options for component tests (`hooksConfig` in Playwright CT). All optional. */
export interface HarnessConfig {
  /** Starting URL for MemoryRouter (for components that read the location). Default "/". */
  route?: string;
  /** Bug-mode defects the component should act out, e.g. ['quantity-negative']. */
  bugs?: string[];
  lang?: Lang;
  currency?: Currency;
  theme?: Theme;
  /**
   * Also mount the data providers (auth, cart, wishlist, live updates). They call the API on mount,
   * so mock it with page.route('**\/api/v1/**', ...) in the test.
   */
  app?: boolean;
}

/**
 * Wraps a component in the providers it may need, without fetching anything unless `app` is set:
 * a fixed config, preferences (language, currency, theme), toasts and an in-memory router.
 */
export function ComponentHarness({ children, route = '/', bugs = [], lang = 'en', currency = 'EUR', theme = 'light', app = false }: HarnessConfig & { children: ReactNode }) {
  const routed = (
    <PrefsProvider initial={{ lang, currency, theme }}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </PrefsProvider>
  );
  const Data = app ? DataProviders : Fragment;
  return (
    <StaticConfigProvider value={{ bugs }}>
      <ToastProvider>
        <Data>{routed}</Data>
      </ToastProvider>
    </StaticConfigProvider>
  );
}

function DataProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <RealtimeProvider>{children}</RealtimeProvider>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  );
}
