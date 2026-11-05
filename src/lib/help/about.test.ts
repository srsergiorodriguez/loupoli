import { describe, expect, it } from 'vitest';
import { APP_ABOUT } from './about';

describe('application licensing metadata', () => {
  it('identifies the source license and commercial licensing path', () => {
    expect(APP_ABOUT.licenseName).toBe('PolyForm Noncommercial 1.0.0');
    expect(APP_ABOUT.licenseStatus).toBe('Source available');
    expect(APP_ABOUT.licenseUrl).toContain('polyformproject.org');
    expect(APP_ABOUT.commercialUrl).toContain('srsergiorodriguez');
  });

  it('credits the sample gorilla under CC BY 4.0', () => {
    expect(APP_ABOUT.sampleLicenseName).toBe('CC BY 4.0');
    expect(APP_ABOUT.sampleLicenseUrl).toContain('creativecommons.org');
    expect(APP_ABOUT.author).toBe('Sergio Rodríguez Gómez');
  });
});
