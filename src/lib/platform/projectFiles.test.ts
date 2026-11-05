import { describe, expect, it } from 'vitest';
import {
  LEGACY_PROJECT_EXTENSION,
  PROJECT_EXTENSION,
  projectFileName
} from './projectFiles';

describe('project file extension', () => {
  it('uses lpoli for new project names', () => {
    expect(PROJECT_EXTENSION).toBe('lpoli');
    expect(projectFileName('Gorilla study')).toBe('Gorilla study.lpoli');
  });

  it('migrates a legacy lpoly filename to the primary extension', () => {
    expect(LEGACY_PROJECT_EXTENSION).toBe('lpoly');
    expect(projectFileName('old-project.lpoly')).toBe('old-project.lpoli');
  });

  it('does not duplicate the extension', () => {
    expect(projectFileName('already.lpoli')).toBe('already.lpoli');
  });
});
