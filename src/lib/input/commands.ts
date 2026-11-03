import { shortcut, type ShortcutId } from './shortcuts';

/** The region or editor that owns a command. */
export type CommandScope = 'global' | 'active' | '3d' | 'uv' | 'shell';

/** Stable command ids. New UI actions must register here first. */
export type CommandId =
  | 'edit.undo'
  | 'edit.redo'
  | 'file.open'
  | 'file.save'
  | 'view.sidebar'
  | 'selection.vertex'
  | 'selection.edge'
  | 'selection.face'
  | 'selection.island'
  | 'selection.all'
  | 'selection.add'
  | 'selection.subtract'
  | 'tool.select'
  | 'tool.lasso'
  | 'tool.move'
  | 'tool.rotate'
  | 'tool.scale'
  | 'view.frame'
  | 'view.home'
  | 'uv.fine'
  | 'uv.fit'
  | 'uv.clamp';

/** One command's presentation and ownership metadata. */
export interface CommandDefinition {
  readonly id: CommandId;
  readonly label: string;
  readonly scope: CommandScope;
  readonly shortcut?: ShortcutId;
  readonly presentation: 'icon' | 'text' | 'icon-text';
}

const definitions: Record<CommandId, Omit<CommandDefinition, 'id'>> = {
  'edit.undo': { label: 'Undo', scope: 'global', shortcut: 'undo', presentation: 'icon' },
  'edit.redo': { label: 'Redo', scope: 'global', shortcut: 'redo', presentation: 'icon' },
  'file.open': { label: 'Open project', scope: 'global', shortcut: 'open', presentation: 'icon' },
  'file.save': { label: 'Save project', scope: 'global', shortcut: 'save', presentation: 'icon' },
  'view.sidebar': { label: 'Toggle sidebar', scope: 'shell', presentation: 'icon' },
  'selection.vertex': { label: 'Vertex', scope: 'active', presentation: 'text' },
  'selection.edge': { label: 'Edge', scope: 'active', presentation: 'text' },
  'selection.face': { label: 'Face', scope: 'active', presentation: 'text' },
  'selection.island': { label: 'Island', scope: 'uv', presentation: 'text' },
  'selection.all': { label: 'All', scope: 'active', shortcut: 'selectAll', presentation: 'text' },
  'selection.add': { label: 'Add', scope: 'active', presentation: 'text' },
  'selection.subtract': { label: 'Subtract', scope: 'active', presentation: 'text' },
  'tool.select': { label: 'Select', scope: 'active', presentation: 'icon' },
  'tool.lasso': { label: 'Lasso', scope: 'active', presentation: 'icon' },
  'tool.move': { label: 'Move', scope: 'active', shortcut: 'move', presentation: 'icon' },
  'tool.rotate': { label: 'Rotate', scope: 'active', shortcut: 'rotate', presentation: 'icon' },
  'tool.scale': { label: 'Scale', scope: 'active', shortcut: 'scale', presentation: 'icon' },
  'view.frame': { label: 'Frame', scope: 'active', shortcut: 'frame', presentation: 'icon' },
  'view.home': { label: 'Home', scope: 'active', shortcut: 'home', presentation: 'icon' },
  'uv.fine': { label: 'Fine', scope: 'uv', presentation: 'text' },
  'uv.fit': { label: 'Fit', scope: 'uv', presentation: 'text' },
  'uv.clamp': { label: 'Clamp', scope: 'uv', presentation: 'text' }
};

/** Look up one command definition. */
export function command(id: CommandId): CommandDefinition {
  return { id, ...definitions[id] };
}

/** Tooltip use of the command's label and shortcut. */
export function commandTooltipFor(id: CommandId): string {
  const definition = command(id);
  return definition.shortcut
    ? `${definition.label} — ${shortcut(definition.shortcut).display}`
    : definition.label;
}
