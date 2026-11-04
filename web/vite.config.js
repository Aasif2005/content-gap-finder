import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The one .env lives at the repo root (the server reads it too). Vite only
  // exposes keys that start with VITE_, so the YouTube/DeepSeek secrets in the
  // same file never reach the browser bundle. That file also says
  // NODE_ENV=development for the server, which Vite would honour and ship a
  // development React; `npm run build` pins NODE_ENV=production to prevent it.
  envDir: '..',
  // The public address (https, preferred host) for canonical links. Vercel sets SITE_URL at build time;
  // without it the page falls back to the address it is served from.
  define: { __SITE_URL__: JSON.stringify((process.env.SITE_URL ?? '').trim().replace(/\/+$/, '')) },
  build: {
    rollupOptions: {
      // Firebase Auth is most of the bundle and changes rarely; its own chunk
      // keeps it cached across our releases and the main chunk under the warning size.
      output: { manualChunks: (id) => (/node_modules\/(@firebase|firebase)\//.test(id) ? 'firebase' : undefined) },
    },
  },
  server: {
    port: 5173,
    // Keeps the browser on one origin so API keys never reach the client.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
});
