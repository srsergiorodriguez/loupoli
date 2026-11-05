import type { AboutLibrary } from './about';
import mitText from './licenses/mit.txt?raw';
import apacheText from './licenses/apache-2.0.txt?raw';

/** One license text that applies to a direct dependency. */
export interface DependencyLicenseText {
  readonly name: string;
  readonly text: string;
}

/**
 * Return the standard license texts for a dependency's SPDX expression.
 *
 * The project URL shown beside the text identifies the copyright holder;
 * package-specific copyright notices remain with each dependency.
 */
export function dependencyLicenseTexts(
  library: Pick<AboutLibrary, 'license'>
): readonly DependencyLicenseText[] {
  const texts: DependencyLicenseText[] = [];
  if (library.license.includes('MIT')) {
    texts.push({ name: 'MIT License', text: mitText });
  }
  if (library.license.includes('Apache-2.0')) {
    texts.push({ name: 'Apache License 2.0', text: apacheText });
  }
  return texts;
}
