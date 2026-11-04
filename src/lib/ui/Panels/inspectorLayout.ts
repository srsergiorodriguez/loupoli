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
  | 'selection'
  | 'mesh'
  | 'modifiers'
  | 'ps1'
  | 'brush'
  | 'texture'
  | 'controls';

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
  { id: 'transform', requires: 'edit3d', order: 20, defaultOpen: false },
  { id: 'selection', requires: 'select3d', order: 30, defaultOpen: true },
  { id: 'mesh', requires: 'edit3d', order: 40, defaultOpen: false },
  { id: 'modifiers', requires: 'edit3d', order: 50, defaultOpen: false },
  { id: 'ps1', requires: 'editRender', order: 60, defaultOpen: false },
  { id: 'brush', requires: 'paintTexture', order: 70, defaultOpen: true },
  { id: 'texture', requires: 'paintTexture', order: 80, defaultOpen: true },
  { id: 'controls', order: 90, defaultOpen: false }
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
