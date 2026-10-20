import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser only ever talks to the web origin; /api and /test are proxied to the API container,
// so cookies are first-party and no CORS is needed.
const target = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
const proxy = {
  '/api': { target, changeOrigin: true, xfwd: true },
  '/test': { target, changeOrigin: true, xfwd: true },
  // Live order status (WebSocket upgrade is proxied too).
  '/ws': { target, changeOrigin: true, ws: true },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, strictPort: true, proxy },
  preview: { port: 5173, host: true, strictPort: true, proxy },
});
