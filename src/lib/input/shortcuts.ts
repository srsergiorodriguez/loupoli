/** Platform-aware modifier label for shortcut hints. */
export const MOD_KEY =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';

/** One displayed shortcut in the shared command vocabulary. */
export interface ShortcutDefinition {
  readonly id: ShortcutId;
  readonly label: string;
  readonly display: string;
}

/** Stable shortcut ids used by tooltips and the future command registry. */
export type ShortcutId =
  | 'undo'
  | 'redo'
  | 'save'
  | 'open'
  | 'newProject'
  | 'selectAll'
  | 'copyKeys'
  | 'pasteKeys'
  | 'delete'
  | 'frame'
  | 'home'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'extrude'
  | 'inset'
  | 'loopCut'
  | 'loopSlide';

const definitions: Record<ShortcutId, Omit<ShortcutDefinition, 'id'>> = {
  undo: { label: 'Undo', display: `${MOD_KEY}Z` },
  redo: { label: 'Redo', display: `⇧${MOD_KEY}Z` },
  save: { label: 'Save project', display: `${MOD_KEY}S` },
  open: { label: 'Open project', display: `${MOD_KEY}O` },
  newProject: { label: 'New project', display: `${MOD_KEY}N` },
  selectAll: { label: 'Select all', display: `${MOD_KEY}A` },
  copyKeys: { label: 'Copy animation keys', display: `${MOD_KEY}C` },
  pasteKeys: { label: 'Paste animation keys', display: `${MOD_KEY}V` },
  delete: { label: 'Delete selection', display: 'Delete' },
  frame: { label: 'Frame selection', display: 'F' },
  home: { label: 'Reset view', display: 'Home' },
  move: { label: 'Move', display: 'G' },
  rotate: { label: 'Rotate', display: 'R' },
  scale: { label: 'Scale', display: 'S' },
  extrude: { label: 'Extrude', display: 'E' },
  inset: { label: 'Inset', display: 'I' },
  loopCut: { label: 'Loop cut', display: 'L' },
  loopSlide: { label: 'Loop slide', display: '⇧L' }
};

/** Look up one shortcut definition. */
export function shortcut(id: ShortcutId): ShortcutDefinition {
  return { id, ...definitions[id] };
}

/** Build a display tooltip such as `Move — G`. */
export function commandTooltip(label: string, id?: ShortcutId): string {
  return id ? `${label} — ${shortcut(id).display}` : label;
}
