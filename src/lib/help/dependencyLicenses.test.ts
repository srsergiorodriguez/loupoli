import { describe, expect, it } from 'vitest';
import { APP_ABOUT } from './about';
import { dependencyLicenseTexts } from './dependencyLicenses';

describe('dependency license texts', () => {
  it('provides readable license text for every direct dependency', () => {
    for (const library of [...APP_ABOUT.runtimeLibraries, ...APP_ABOUT.buildLibraries]) {
      const licenses = dependencyLicenseTexts(library);
      expect(licenses.length, library.name).toBeGreaterThan(0);
      for (const license of licenses) {
        expect(license.text.length, library.name).toBeGreaterThan(500);
      }
    }
  });

  it('includes both texts for dual-licensed dependencies', () => {
    const tauri = APP_ABOUT.runtimeLibraries.find((library) => library.name === 'Tauri');
    expect(tauri).toBeDefined();
    expect(dependencyLicenseTexts(tauri!).map((license) => license.name)).toEqual([
      'MIT License',
      'Apache License 2.0'
    ]);
  });
});
