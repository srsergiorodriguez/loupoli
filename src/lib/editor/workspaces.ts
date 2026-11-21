import type { Workspace } from './types';

/** Capabilities a workspace may grant to input, commands, and chrome. */
export type WorkspaceCapability =
  | 'select3d'
  | 'edit3d'
  | 'selectUv'
  | 'editUv'
  | 'seamAuthoring'
  | 'paintTexture'
  | 'paintProjected'
  | 'editRender'
  | 'editTopology'
  | 'editLook'
  | 'editCamera'
  | 'editAnimation'
  | 'editShapes'
  | 'editLighting'
  | 'bakeLighting'
  | 'navigate3d'
  | 'annotate3d';

const POLICY: Record<Workspace, ReadonlySet<WorkspaceCapability>> = {
  model: new Set([
    'select3d',
    'edit3d',
    'editTopology',
    'editRender',
    'editLook',
    'navigate3d',
    'annotate3d'
  ]),
  light: new Set([
    'editLighting',
    'bakeLighting',
    'navigate3d',
    'annotate3d'
  ]),
  uv: new Set([
    'select3d',
    'selectUv',
    'editUv',
    'seamAuthoring',
    'navigate3d',
    'annotate3d'
  ]),
  paint: new Set(['paintTexture', 'paintProjected', 'navigate3d', 'annotate3d']),
  animation: new Set([
    'select3d',
    'edit3d',
    'editAnimation',
    'editShapes',
    'navigate3d',
    'annotate3d'
  ]),
  render: new Set(['editCamera', 'navigate3d', 'annotate3d'])
};

/** True when the workspace grants a capability. */
export function workspaceCan(
  workspace: Workspace,
  capability: WorkspaceCapability
): boolean {
  return POLICY[workspace].has(capability);
}

/** Whether editor annotations should be visible in a workspace. */
export function annotationsVisible(
  workspace: Workspace,
  cameraView = false
): boolean {
  return (
    workspaceCan(workspace, 'annotate3d') &&
    !(workspace === 'render' && cameraView)
  );
}

/** Immutable capability view for UI and input consumers. */
export function workspaceCapabilities(
  workspace: Workspace
): ReadonlySet<WorkspaceCapability> {
  return POLICY[workspace];
}
