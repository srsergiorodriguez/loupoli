# loupoli PWA

`loupoli` can be deployed as an installable web app without changing the Tauri
native shell. The shared frontend, editor, document format, and rendering code
are identical. Only the platform services differ.

## Build and preview

```bash
npm run build
npm run preview:pwa
```

Open `http://127.0.0.1:4173` in a browser for local verification. Production
deployment must use HTTPS; service workers are unavailable on plain HTTP except
for localhost.

The Vite production build emits `sw.js` and precaches the app shell, manifest,
icons, and hashed scripts. The client registers the worker only in a normal
browser. Registration is explicitly disabled when `window.__TAURI_INTERNALS__`
exists, so the native app never serves a stale web cache.

## GitHub Pages

The repository includes `site/` for the public landing page and
`.github/workflows/pages.yml` for deployment. A project Pages site is assembled
as:

```text
https://<user>.github.io/<repo>/       site/index.html
https://<user>.github.io/<repo>/app/   dist/ (the PWA)
```

Enable **Settings → Pages → Build and deployment → GitHub Actions**, then push
to `main`. The workflow passes the repository base path to Vite, so hashed
assets, the manifest, documentation images, the service worker, and its scope
all stay under `/app/`.

For a custom domain at the root, create a repository variable
`PWA_BASE_PATH=/app/`; the landing page already links to `app/`.

## Install on iPad

1. Open the HTTPS landing page in Safari and choose **Open web app**.
2. Tap **Share → Add to Home Screen**.
3. Launch loupoli from the Home Screen icon.

The app then runs in standalone mode with the dark background and safe-area
layout. There is no automatic install prompt on iPadOS.

## Platform differences

The PWA uses browser APIs and therefore cannot provide:

- Save-in-place to an existing `.lpoli` file.
- Native file dialogs, Files/iCloud integration, or file associations.
- Atomic temp-file project writes.
- The AVFoundation MP4 writer.
- The same background and process-kill recovery guarantees as the native app.

Saving a project downloads a copy. Opening a project uses the browser file
picker. The shared autosave path still uses IndexedDB, but browsers can evict
origin storage; export important work to a `.lpoli` file regularly.

MediaRecorder may offer an MP4 or WebM fallback depending on the browser's
codecs. PNG stills and frame sequences remain available.

## Deployment notes

- The PWA lives at `/app/` on a project Pages site; `site/` is the root landing page.
- The manifest and icons are relative to the app directory.
- The service worker uses network-first navigation and cache-first hashed assets.
- Rebuild and redeploy to replace the cached shell. The old cache is removed on
  activation.

## Native shell

The Tauri app remains the primary desktop and App Store product. PWA files are
additive and do not change native file I/O, MP4 export, or project persistence.
