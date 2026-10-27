import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  build: {
    // Phaser alone is ~1.2 MB minified; that's expected for a game bundle.
    chunkSizeWarningLimit: 2000,
  },
  server: {
    // To try the leaderboard locally, run the PHP API (php -S localhost:8080 -t server) and
    // start Vite with PQ_API=http://localhost:8080 so /api requests are forwarded to it.
    proxy: process.env.PQ_API ? { '/api': process.env.PQ_API } : undefined,
  },
  plugins: [
    {
      // Ship the PHP leaderboard API inside dist/, so deploying is one folder upload.
      name: 'copy-php-api',
      apply: 'build',
      closeBundle() {
        cpSync('server/api', 'dist/api', { recursive: true });
      },
    },
  ],
});
