import packageJson from '../../../package.json';

/** One open-source dependency shown in the About dialog. */
export interface AboutLibrary {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly url: string;
}

/** Application metadata and direct dependency attribution. */
export const APP_ABOUT = {
  version: packageJson.version,
  author: 'Sergio Rodríguez Gómez',
  licenseStatus: 'Not chosen yet',
  runtimeLibraries: [
    {
      name: 'three.js',
      version: '0.187.0',
      license: 'MIT',
      url: 'https://github.com/mrdoob/three.js'
    },
    {
      name: 'Svelte',
      version: '5.57.3',
      license: 'MIT',
      url: 'https://github.com/sveltejs/svelte'
    },
    {
      name: 'Tauri API',
      version: '2.12.4',
      license: 'Apache-2.0 OR MIT',
      url: 'https://github.com/tauri-apps/tauri'
    },
    {
      name: 'Tauri dialog plugin',
      version: '2.8.4',
      license: 'MIT OR Apache-2.0',
      url: 'https://github.com/tauri-apps/plugins-workspace'
    },
    {
      name: 'Tauri',
      version: '2.12.5',
      license: 'MIT OR Apache-2.0',
      url: 'https://github.com/tauri-apps/tauri'
    },
    {
      name: 'serde',
      version: '1.0',
      license: 'MIT OR Apache-2.0',
      url: 'https://github.com/serde-rs/serde'
    },
    {
      name: 'serde_json',
      version: '1.0',
      license: 'MIT OR Apache-2.0',
      url: 'https://github.com/serde-rs/json'
    }
  ] satisfies readonly AboutLibrary[],
  buildLibraries: [
    {
      name: 'Vite',
      version: '8.3.5',
      license: 'MIT',
      url: 'https://github.com/vitejs/vite'
    },
    {
      name: 'TypeScript',
      version: '5.9.3',
      license: 'Apache-2.0',
      url: 'https://github.com/microsoft/TypeScript'
    },
    {
      name: 'Vitest',
      version: '5.0.5',
      license: 'MIT',
      url: 'https://github.com/vitest-dev/vitest'
    },
    {
      name: 'svelte-check',
      version: '4.7.8',
      license: 'MIT',
      url: 'https://github.com/sveltejs/language-tools'
    },
    {
      name: '@sveltejs/vite-plugin-svelte',
      version: '7.3.1',
      license: 'MIT',
      url: 'https://github.com/sveltejs/vite-plugin-svelte'
    },
    {
      name: 'Tauri CLI',
      version: '2.12.4',
      license: 'Apache-2.0 OR MIT',
      url: 'https://github.com/tauri-apps/tauri'
    }
  ] satisfies readonly AboutLibrary[]
} as const;
