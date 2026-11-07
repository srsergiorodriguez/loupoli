import type { Workspace } from '../../editor/types';
import {
  workspaceCan,
  type WorkspaceCapability
} from '../../editor/workspaces';

/** Stable IDs for the Inspector's independently rendered sections. */
export type InspectorSectionId =
  | 'scene'
  | 'transform'
  | 'light'
  | 'camera'
  | 'animation'
  | 'render'
  | 'selection'
  | 'mesh'
  | 'shapes'
  | 'modifiers'
  | 'brush'
  | 'texture';

/** One policy-driven Inspector section. */
export interface InspectorSectionDefinition {
  readonly id: InspectorSectionId;
  readonly requires?: WorkspaceCapability;
  readonly order: number;
  readonly defaultOpen: boolean;
}

export const INSPECTOR_SECTIONS: readonly InspectorSectionDefinition[] = [
  { id: 'scene', order: 10, defaultOpen: true },
  { id: 'light', requires: 'bakeLighting', order: 15, defaultOpen: true },
  { id: 'camera', requires: 'editCamera', order: 20, defaultOpen: true },
  { id: 'animation', requires: 'editAnimation', order: 22, defaultOpen: true },
  { id: 'render', requires: 'editCamera', order: 25, defaultOpen: true },
  { id: 'transform', requires: 'edit3d', order: 26, defaultOpen: false },
  { id: 'selection', requires: 'select3d', order: 28, defaultOpen: true },
  { id: 'mesh', requires: 'editTopology', order: 30, defaultOpen: false },
  { id: 'shapes', requires: 'editShapes', order: 24, defaultOpen: false },
  { id: 'modifiers', requires: 'editTopology', order: 40, defaultOpen: false },
  { id: 'brush', requires: 'paintTexture', order: 70, defaultOpen: true },
  { id: 'texture', requires: 'paintTexture', order: 80, defaultOpen: true }
];

/** Ordered, filtered section IDs for the active workspace. */
export function inspectorSectionsFor(
  workspace: Workspace
): readonly InspectorSectionId[] {
  return INSPECTOR_SECTIONS.filter(
    (section) =>
      section.requires === undefined ||
      workspaceCan(workspace, section.requires)
  )
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => section.id);
}

/** Default open state for every section, independent of workspace. */
export function defaultInspectorOpen(): Record<InspectorSectionId, boolean> {
  return Object.fromEntries(
    INSPECTOR_SECTIONS.map((section) => [section.id, section.defaultOpen])
  ) as Record<InspectorSectionId, boolean>;
}
