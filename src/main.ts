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

mount(App, { target });
