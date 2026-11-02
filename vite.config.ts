import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    host: host || false,
    port: 1420,
    strictPort: true,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421
        }
      : undefined,
    watch: {
      ignored: [
        '**/src-tauri/**',
        '**/docs/**',
        '**/.chrome-*/**',
        '**/.cargo-home/**',
        '**/.npm-cache/**',
        '**/dist/**'
      ]
    }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'safari16.4',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    // Three.js is a required part of the viewport's core chunk. The single
    // chunk is intentionally near this size until the Phase 4 tooling surface
    // justifies splitting texture/UV code.
    chunkSizeWarningLimit: 800
  }
});
