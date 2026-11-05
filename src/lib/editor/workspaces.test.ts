import { describe, expect, it } from 'vitest';
import { workspaceCan } from './workspaces';
import {
  defaultInspectorOpen,
  inspectorSectionsFor
} from '../ui/Panels/inspectorLayout';

describe('workspace capabilities', () => {
  it('grants selection but not mesh editing in UV', () => {
    expect(workspaceCan('uv', 'select3d')).toBe(true);
    expect(workspaceCan('uv', 'edit3d')).toBe(false);
    expect(workspaceCan('uv', 'seamAuthoring')).toBe(true);
  });

  it('grants paint but no selection in Paint', () => {
    expect(workspaceCan('paint', 'paintTexture')).toBe(true);
    expect(workspaceCan('paint', 'paintProjected')).toBe(true);
    expect(workspaceCan('paint', 'select3d')).toBe(false);
    expect(workspaceCan('paint', 'edit3d')).toBe(false);
  });
});

describe('inspector layout', () => {
  it('keeps brush and texture adjacent in Paint', () => {
    expect(inspectorSectionsFor('paint')).toEqual([
      'scene',
      'brush',
      'texture',
      'controls'
    ]);
  });

  it('keeps selection for UV seams and hides 3D editing sections', () => {
    expect(inspectorSectionsFor('uv')).toEqual([
      'scene',
      'selection',
      'controls'
    ]);
  });

  it('gives Light its own workspace, ordering, and no mesh editing', () => {
    expect(workspaceCan('light', 'editLighting')).toBe(true);
    expect(workspaceCan('light', 'bakeLighting')).toBe(true);
    expect(workspaceCan('light', 'edit3d')).toBe(false);
    expect(inspectorSectionsFor('light')).toEqual(['scene', 'light', 'controls']);
  });

  it('exposes the full modeling order only in Model', () => {
    expect(inspectorSectionsFor('model')).toEqual([
      'scene',
      'transform',
      'selection',
      'mesh',
      'shapes',
      'modifiers',
      'ps1',
      'controls'
    ]);
  });

  it('gives Render its own camera and render sections', () => {
    expect(workspaceCan('render', 'editCamera')).toBe(true);
    expect(workspaceCan('render', 'edit3d')).toBe(false);
    expect(inspectorSectionsFor('render')).toEqual([
      'scene',
      'camera',
      'render',
      'controls'
    ]);
  });

  it('gives Animation its own timeline section', () => {
    expect(workspaceCan('animation', 'editAnimation')).toBe(true);
    expect(workspaceCan('animation', 'edit3d')).toBe(false);
    expect(inspectorSectionsFor('animation')).toEqual([
      'scene',
      'animation',
      'shapes',
      'controls'
    ]);
  });

  it('opens Scene, Selection, Brush, and Texture by default', () => {
    const defaults = defaultInspectorOpen();
    expect(defaults.scene).toBe(true);
    expect(defaults.selection).toBe(true);
    expect(defaults.brush).toBe(true);
    expect(defaults.texture).toBe(true);
  });
});
