import type { PaintTool } from './types';

/** Stable identity for one bundled brush preset. */
export type BrushPresetId =
  | 'ink'
  | 'soft'
  | 'hard'
  | 'tilt'
  | 'grain'
  | 'eraser';

/** Brush behavior captured by one preset. */
export interface BrushPreset {
  readonly id: BrushPresetId;
  readonly label: string;
  readonly tool: PaintTool;
  readonly hardness: number;
  readonly smoothing: number;
  readonly spacing: number;
  readonly noise: number;
  readonly pressureCurve: number;
  readonly pressureMin: number;
  readonly pressureOpacity: boolean;
  readonly tiltEnabled: boolean;
  readonly taperIn: number;
}

/** Bundled low-poly texture brushes. */
export const BRUSH_PRESETS: readonly BrushPreset[] = [
  {
    id: 'ink',
    label: 'Ink',
    tool: 'brush',
    hardness: 1,
    smoothing: 0.08,
    spacing: 0.12,
    noise: 0,
    pressureCurve: 1,
    pressureMin: 0.25,
    pressureOpacity: false,
    tiltEnabled: false,
    taperIn: 24
  },
  {
    id: 'soft',
    label: 'Soft',
    tool: 'brush',
    hardness: 0.2,
    smoothing: 0.3,
    spacing: 0.2,
    noise: 0,
    pressureCurve: 0.85,
    pressureMin: 0.5,
    pressureOpacity: false,
    tiltEnabled: false,
    taperIn: 0
  },
  {
    id: 'hard',
    label: 'Hard',
    tool: 'brush',
    hardness: 1,
    smoothing: 0,
    spacing: 0.1,
    noise: 0,
    pressureCurve: 1,
    pressureMin: 0.35,
    pressureOpacity: false,
    tiltEnabled: false,
    taperIn: 0
  },
  {
    id: 'tilt',
    label: 'Tilt',
    tool: 'brush',
    hardness: 0.7,
    smoothing: 0.18,
    spacing: 0.15,
    noise: 0.05,
    pressureCurve: 1,
    pressureMin: 0.35,
    pressureOpacity: false,
    tiltEnabled: true,
    taperIn: 0
  },
  {
    id: 'grain',
    label: 'Grain',
    tool: 'brush',
    hardness: 0.55,
    smoothing: 0.12,
    spacing: 0.18,
    noise: 0.4,
    pressureCurve: 1,
    pressureMin: 0.4,
    pressureOpacity: false,
    tiltEnabled: false,
    taperIn: 0
  },
  {
    id: 'eraser',
    label: 'Eraser',
    tool: 'eraser',
    hardness: 0.75,
    smoothing: 0.15,
    spacing: 0.15,
    noise: 0,
    pressureCurve: 1,
    pressureMin: 0.35,
    pressureOpacity: false,
    tiltEnabled: false,
    taperIn: 0
  }
];

/** Find a bundled preset by id. */
export function brushPreset(id: BrushPresetId): BrushPreset {
  return BRUSH_PRESETS.find((preset) => preset.id === id) ?? BRUSH_PRESETS[0];
}
