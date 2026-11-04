import { shortcut, type ShortcutId } from './shortcuts';

/** The region or editor that owns a command. */
export type CommandScope = 'global' | 'active' | '3d' | 'uv' | 'paint' | 'shell';

/** Stable command ids. New UI actions must register here first. */
export type CommandId =
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.delete'
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'view.sidebar'
  | 'selection.vertex'
  | 'selection.edge'
  | 'selection.face'
  | 'selection.island'
  | 'selection.loop'
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
  | 'transform.axisX'
  | 'transform.axisY'
  | 'transform.axisZ'
  | 'mesh.extrude'
  | 'mesh.inset'
  | 'mesh.loopCut'
  | 'mesh.loopSlide'
  | 'uv.axisU'
  | 'uv.axisV'
  | 'uv.fine'
  | 'uv.fit'
  | 'uv.clamp'
  | 'paint.brush'
  | 'paint.eraser'
  | 'paint.line'
  | 'paint.rectangle'
  | 'paint.ellipse'
  | 'paint.gradient'
  | 'paint.fill';

/** One command's presentation and ownership metadata. */
/** One keyboard binding attached to a command. */
export interface KeyBinding {
  readonly key: string;
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

/** One command's presentation, ownership, and keyboard metadata. */
export interface CommandDefinition {
  readonly id: CommandId;
  readonly label: string;
  readonly scope: CommandScope;
  readonly shortcut?: ShortcutId;
  readonly presentation: 'icon' | 'text' | 'icon-text';
  readonly bindings?: readonly KeyBinding[];
}

const definitions: Record<CommandId, Omit<CommandDefinition, 'id'>> = {
  'edit.undo': { label: 'Undo', scope: 'global', shortcut: 'undo', presentation: 'icon', bindings: [{ key: 'z', mod: true, shift: false }] },
  'edit.redo': { label: 'Redo', scope: 'global', shortcut: 'redo', presentation: 'icon', bindings: [{ key: 'z', mod: true, shift: true }, { key: 'y', mod: true }] },
  'file.new': { label: 'New project', scope: 'global', shortcut: 'newProject', presentation: 'icon', bindings: [{ key: 'n', mod: true }] },
  'file.open': { label: 'Open project', scope: 'global', shortcut: 'open', presentation: 'icon', bindings: [{ key: 'o', mod: true }] },
  'file.save': { label: 'Save project', scope: 'global', shortcut: 'save', presentation: 'icon', bindings: [{ key: 's', mod: true }] },
  'view.sidebar': { label: 'Toggle sidebar', scope: 'shell', presentation: 'icon' },
  'selection.vertex': { label: 'Vertex', scope: 'active', presentation: 'text' },
  'selection.edge': { label: 'Edge', scope: 'active', presentation: 'text' },
  'selection.face': { label: 'Face', scope: 'active', presentation: 'text' },
  'selection.island': { label: 'Island', scope: 'uv', presentation: 'text' },
  'selection.loop': { label: 'Loop', scope: 'active', presentation: 'text' },
  'selection.all': { label: 'All', scope: 'active', shortcut: 'selectAll', presentation: 'text', bindings: [{ key: 'a', mod: true }] },
  'selection.add': { label: 'Add', scope: 'active', presentation: 'text' },
  'selection.subtract': { label: 'Sub', scope: 'active', presentation: 'text' },
  'tool.select': { label: 'Select', scope: 'active', presentation: 'icon' },
  'tool.lasso': { label: 'Lasso', scope: 'active', presentation: 'icon' },
  'tool.move': { label: 'Move', scope: 'active', shortcut: 'move', presentation: 'icon', bindings: [{ key: 'g' }] },
  'tool.rotate': { label: 'Rotate', scope: 'active', shortcut: 'rotate', presentation: 'icon', bindings: [{ key: 'r' }] },
  'tool.scale': { label: 'Scale', scope: 'active', shortcut: 'scale', presentation: 'icon', bindings: [{ key: 's' }] },
  'view.frame': { label: 'Frame', scope: 'active', shortcut: 'frame', presentation: 'icon', bindings: [{ key: 'f' }] },
  'view.home': { label: 'Home', scope: 'active', shortcut: 'home', presentation: 'icon', bindings: [{ key: 'home' }] },
  'edit.delete': { label: 'Delete selection', scope: 'active', shortcut: 'delete', presentation: 'text', bindings: [{ key: 'delete' }, { key: 'backspace' }] },
  'transform.axisX': { label: 'X axis lock', scope: '3d', presentation: 'text', bindings: [{ key: 'x' }] },
  'transform.axisY': { label: 'Y axis lock', scope: '3d', presentation: 'text', bindings: [{ key: 'y' }] },
  'transform.axisZ': { label: 'Z axis lock', scope: '3d', presentation: 'text', bindings: [{ key: 'z' }] },
  'mesh.extrude': { label: 'Extrude', scope: '3d', shortcut: 'extrude', presentation: 'icon-text', bindings: [{ key: 'e' }] },
  'mesh.inset': { label: 'Inset', scope: '3d', shortcut: 'inset', presentation: 'icon-text', bindings: [{ key: 'i' }] },
  'mesh.loopCut': { label: 'Loop cut', scope: '3d', shortcut: 'loopCut', presentation: 'icon-text', bindings: [{ key: 'l', shift: false }] },
  'mesh.loopSlide': { label: 'Loop slide', scope: '3d', shortcut: 'loopSlide', presentation: 'icon-text', bindings: [{ key: 'l', shift: true }] },
  'uv.axisU': { label: 'U axis lock', scope: 'uv', presentation: 'text', bindings: [{ key: 'u' }] },
  'uv.axisV': { label: 'V axis lock', scope: 'uv', presentation: 'text', bindings: [{ key: 'v' }] },
  'uv.fine': { label: 'Fine', scope: 'uv', presentation: 'text' },
  'uv.fit': { label: 'Fit', scope: 'uv', presentation: 'text' },
  'uv.clamp': { label: 'Clamp', scope: 'uv', presentation: 'text' },
  'paint.brush': { label: 'Brush', scope: 'paint', presentation: 'icon', bindings: [{ key: 'b' }] },
  'paint.eraser': { label: 'Eraser', scope: 'paint', presentation: 'icon', bindings: [{ key: 'e' }] },
  'paint.line': { label: 'Line', scope: 'paint', presentation: 'icon', bindings: [{ key: 'l' }] },
  'paint.rectangle': { label: 'Rectangle', scope: 'paint', presentation: 'icon', bindings: [{ key: 'r' }] },
  'paint.ellipse': { label: 'Ellipse', scope: 'paint', presentation: 'icon', bindings: [{ key: 'o' }] },
  'paint.gradient': { label: 'Gradient', scope: 'paint', presentation: 'icon', bindings: [{ key: 'g' }] },
  'paint.fill': { label: 'Fill', scope: 'paint', presentation: 'icon', bindings: [{ key: 'f' }] }
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


function bindingMatches(binding: KeyBinding, event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  if (key !== binding.key) {
    return false;
  }
  const mod = event.metaKey || event.ctrlKey;
  if (Boolean(binding.mod) !== mod) {
    return false;
  }
  if (binding.shift !== undefined && binding.shift !== event.shiftKey) {
    return false;
  }
  return binding.alt === undefined ? !event.altKey : binding.alt === event.altKey;
}

/** Resolve a keyboard event to a registered command, if one matches. */
export function commandForKeyboardEvent(event: KeyboardEvent): CommandId | null {
  for (const [id, definition] of Object.entries(definitions)) {
    if (definition.bindings?.some((binding) => bindingMatches(binding, event))) {
      return id as CommandId;
    }
  }
  return null;
}
