import { describe, expect, it } from 'vitest';
import { DOCUMENTATION } from './documentation';

describe('workspace documentation', () => {
  it('covers every workspace with unique tabs and image assets', () => {
    expect(DOCUMENTATION.map((page) => page.id)).toEqual([
      'model',
      'uv',
      'paint',
      'light',
      'animate',
      'render'
    ]);
    expect(new Set(DOCUMENTATION.map((page) => page.image)).size).toBe(
      DOCUMENTATION.length
    );
    expect(DOCUMENTATION.every((page) => page.image.startsWith('/documentation/'))).toBe(
      true
    );
  });

  it('provides prose sections and unique control references', () => {
    for (const page of DOCUMENTATION) {
      expect(page.summary.length).toBeGreaterThan(80);
      expect(page.sections.length).toBeGreaterThan(1);
      for (const section of page.sections) {
        expect(section.heading.length).toBeGreaterThan(2);
        expect(section.paragraphs.length).toBeGreaterThan(0);
        expect(section.paragraphs.every((paragraph) => paragraph.length > 40)).toBe(
          true
        );
        const controls = section.controls ?? [];
        expect(new Set(controls).size).toBe(controls.length);
      }
    }
  });
});
