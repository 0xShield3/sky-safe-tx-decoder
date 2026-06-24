import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

// https://vite.dev/config/
//
// Two build modes:
//   - default:  multi-file dist/ for hosting (Cloudflare Pages, IPFS) — unchanged
//   - offline:  `vite build --mode offline` → a single self-contained
//               dist-offline/index.html that runs by opening it in a browser
//               (file://), no server / npm required. Relative base + everything
//               inlined so there are no external module fetches (which browsers
//               block from file://). Still fetches the Safe API over the network.
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    base: offline ? './' : '/',
    // Skip copying public/ in offline mode — its only file (_headers) is a
    // Cloudflare-only directive, useless for a single file opened from disk.
    publicDir: offline ? false : 'public',
    plugins: [react(), ...(offline ? [viteSingleFile()] : [])],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: offline ? 'dist-offline' : 'dist',
      sourcemap: !offline,
    },
  };
});
