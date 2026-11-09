import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const host = process.env.TAURI_DEV_HOST;

/**
 * Emit a small service worker after the app bundle is complete.
 *
 * The generated file is inert inside Tauri because the client registers it only
 * in a normal browser. The worker keeps navigations network-first and hashed
 * assets cache-first, so an offline launch falls back to the last shell while a
 * new deployment can replace it on the next online visit.
 */
function pwaServiceWorker(): Plugin {
  let base = '/';
  return {
    name: 'loupoli-pwa',
    apply: 'build',
    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`;
    },
    generateBundle(_options, bundle) {
      const precache = new Set<string>();
      for (const fileName of Object.keys(bundle)) {
        if (fileName.endsWith('.map') || fileName === 'sw.js') {
          continue;
        }
        if (/\.(?:js|css|html|png|svg|ico|webmanifest|woff2?)$/.test(fileName)) {
          precache.add(`${base}${fileName}`);
        }
      }
      precache.add(`${base}index.html`);
      for (const fileName of [
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-512.png',
        'icons/apple-touch-icon.png'
      ]) {
        precache.add(`${base}${fileName}`);
      }
      const cacheName = `loupoli-shell-${Date.now().toString(36)}`;
      const source = `const CACHE_NAME = ${JSON.stringify(cacheName)};
const INDEX_URL = ${JSON.stringify(`${base}index.html`)};
const PRECACHE = ${JSON.stringify([...precache].sort())};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(INDEX_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(INDEX_URL).then((cached) => cached || Response.error()))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
`;
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source
      });
    }
  };
}

export default defineConfig({
  plugins: [svelte(), pwaServiceWorker()],
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
