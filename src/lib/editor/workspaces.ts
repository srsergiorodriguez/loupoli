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
  | 'editCamera'
  | 'editAnimation'
  | 'editLighting'
  | 'bakeLighting'
  | 'navigate3d';

const POLICY: Record<Workspace, ReadonlySet<WorkspaceCapability>> = {
  model: new Set([
    'select3d',
    'edit3d',
    'editRender',
    'navigate3d'
  ]),
  light: new Set([
    'editLighting',
    'bakeLighting',
    'navigate3d'
  ]),
  uv: new Set([
    'select3d',
    'selectUv',
    'editUv',
    'seamAuthoring',
    'navigate3d'
  ]),
  paint: new Set(['paintTexture', 'paintProjected', 'navigate3d']),
  animation: new Set(['editAnimation', 'navigate3d']),
  render: new Set(['editCamera', 'navigate3d'])
};

/** True when the workspace grants a capability. */
export function workspaceCan(
  workspace: Workspace,
  capability: WorkspaceCapability
): boolean {
  return POLICY[workspace].has(capability);
}

/** Immutable capability view for UI and input consumers. */
export function workspaceCapabilities(
  workspace: Workspace
): ReadonlySet<WorkspaceCapability> {
  return POLICY[workspace];
}
