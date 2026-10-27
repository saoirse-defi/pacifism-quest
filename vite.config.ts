import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  build: {
    // Phaser alone is ~1.2 MB minified; that's expected for a game bundle.
    chunkSizeWarningLimit: 2000,
  },
});
