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
      'texture'
    ]);
  });

  it('keeps selection for UV seams and hides 3D editing sections', () => {
    expect(inspectorSectionsFor('uv')).toEqual([
      'scene',
      'selection'
    ]);
  });

  it('gives Light its own workspace, ordering, and no mesh editing', () => {
    expect(workspaceCan('light', 'editLighting')).toBe(true);
    expect(workspaceCan('light', 'bakeLighting')).toBe(true);
    expect(workspaceCan('light', 'edit3d')).toBe(false);
    expect(workspaceCan('light', 'editTopology')).toBe(false);
    expect(inspectorSectionsFor('light')).toEqual(['scene', 'light']);
  });

  it('exposes the full modeling order only in Model', () => {
    expect(workspaceCan('model', 'editTopology')).toBe(true);
    expect(workspaceCan('model', 'editLook')).toBe(true);
    expect(inspectorSectionsFor('model')).toEqual([
      'scene',
      'transform',
      'selection',
      'mesh',
      'modifiers'
    ]);
  });

  it('gives Render its own camera and render sections', () => {
    expect(workspaceCan('render', 'editCamera')).toBe(true);
    expect(workspaceCan('render', 'edit3d')).toBe(false);
    expect(inspectorSectionsFor('render')).toEqual([
      'scene',
      'camera',
      'render'
    ]);
  });

  it('gives Animation its own timeline section', () => {
    expect(workspaceCan('animation', 'editAnimation')).toBe(true);
    expect(workspaceCan('animation', 'edit3d')).toBe(true);
    expect(workspaceCan('animation', 'editTopology')).toBe(false);
    expect(workspaceCan('animation', 'editLook')).toBe(false);
    expect(inspectorSectionsFor('animation')).toEqual([
      'scene',
      'animation',
      'shapes',
      'transform',
      'selection'
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
