import { mount } from 'svelte';
import * as THREE from 'three';
import App from './App.svelte';
import './design/tokens.css';
import './design/base.css';

// Z-up is established globally before any scene object is constructed. This is
// the same right-handed coordinate convention used by Blender: XY is the floor.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// Set touch density before first paint so hit targets and panel padding do not
// flash from desktop values on an iPad.
document.documentElement.dataset.density = window.matchMedia('(pointer: coarse)')
  .matches
  ? 'touch'
  : 'fine';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Missing #app mount target.');
}

const isTauri = '__TAURI_INTERNALS__' in window;
const standalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
document.documentElement.dataset.runtime = isTauri
  ? 'tauri'
  : standalone
    ? 'standalone'
    : 'browser';

function registerPwa(): void {
  if (
    !import.meta.env.PROD ||
    isTauri ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }
  // Cache the installed shell for offline launches. Keep this out of Tauri:
  // the native app must always load the bundled assets, never a stale web cache.
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL
    })
    .catch(() => {
      // Offline support is an enhancement; the editor still works without it.
    });
}

if (document.readyState === 'complete') {
  registerPwa();
} else {
  window.addEventListener('load', registerPwa, { once: true });
}
if (!isTauri) {
  const persistence = navigator.storage?.persist?.();
  void persistence?.catch(() => {
    // Storage persistence is best-effort; exporting a project copy remains the
    // durable fallback when the browser declines it.
  });
}

mount(App, { target });
