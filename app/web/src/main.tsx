import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './App';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ConfigProvider } from './context/ConfigContext';
import { PrefsProvider } from './context/PrefsContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { ToastProvider } from './context/ToastContext';
import { WishlistProvider } from './context/WishlistContext';
import './styles.css';

// A data router is needed for useBlocker (the leave-checkout warning). React Router 7 made the old v7_* future flags
// the default behaviour, so none are set here.
const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <RealtimeProvider>
                <PrefsProvider>
                  <RouterProvider router={router} />
                </PrefsProvider>
              </RealtimeProvider>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </ConfigProvider>
  </StrictMode>,
);
