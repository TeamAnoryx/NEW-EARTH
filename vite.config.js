import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`          -> dist/        (static site, serve with any web server)
// `npm run build:offline`  -> dist-offline/index.html (one self-contained file, double-click to play, no internet)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'offline' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'offline' ? 'dist-offline' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
}));
