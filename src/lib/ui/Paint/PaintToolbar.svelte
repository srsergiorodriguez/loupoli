<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import { rgbaColor } from '../../paint/brush';
  import {
    DEFAULT_PAINT_SPACING,
    type PaintTool
  } from '../../paint/types';
  import type { IconName } from '../Icons/types';
  import IconButton from '../Primitives/IconButton.svelte';
  import BrushPreview from './BrushPreview.svelte';
  import PaintColorSwatch from './PaintColorSwatch.svelte';
  import { commandTooltipFor, type CommandId } from '../../input/commands';

  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  interface ToolChoice {
    readonly tool: PaintTool;
    readonly icon: IconName;
    readonly command: CommandId;
    readonly key: string;
  }

  const tools: readonly ToolChoice[] = [
    { tool: 'brush', icon: 'brush', command: 'paint.brush', key: 'B' },
    { tool: 'eraser', icon: 'eraser', command: 'paint.eraser', key: 'E' },
    { tool: 'line', icon: 'line', command: 'paint.line', key: 'L' },
    { tool: 'rectangle', icon: 'rectangle', command: 'paint.rectangle', key: 'R' },
    { tool: 'ellipse', icon: 'ellipse', command: 'paint.ellipse', key: 'O' },
    { tool: 'gradient', icon: 'gradient', command: 'paint.gradient', key: 'G' },
    { tool: 'fill', icon: 'fill', command: 'paint.fill', key: 'F' }
  ];

  const gradientPreview = $derived(
    `linear-gradient(to right, ${rgbaColor(
      session.snapshot.uvBrushColor,
      session.snapshot.uvBrushColorAlpha
    )}, ${rgbaColor(
      session.snapshot.paintSecondaryColor,
      session.snapshot.paintSecondaryColorAlpha
    )})`
  );

  const settings = $derived({
    tool: session.snapshot.paintTool,
    color: session.snapshot.uvBrushColor,
    colorAlpha: session.snapshot.uvBrushColorAlpha,
    secondaryColor: session.snapshot.paintSecondaryColor,
    secondaryColorAlpha: session.snapshot.paintSecondaryColorAlpha,
    radius: session.snapshot.uvBrushSize / 2,
    opacity: session.snapshot.uvBrushOpacity,
    hardness: session.snapshot.paintHardness,
    smoothing: session.snapshot.paintSmoothing,
    noise: session.snapshot.paintNoise,
    pressureOpacity: session.snapshot.paintPressureOpacity,
    pressureCurve: session.snapshot.paintPressureCurve,
    pressureMin: session.snapshot.paintPressureMin,
    tiltEnabled: session.snapshot.paintTiltEnabled,
    taperIn: session.snapshot.paintTaperIn,
    spacing: session.snapshot.paintSpacing ?? DEFAULT_PAINT_SPACING,
    shapeFilled: session.snapshot.paintShapeFilled,
    gradient: session.snapshot.paintGradient
  });

  const canFillSelection = $derived.by(() => {
    const snapshot = session.snapshot;
    if (snapshot.workspace !== 'paint' || !snapshot.activeNodeTextureId) {
      return false;
    }
    const activeLayer = snapshot.textureLayers.find(
      (layer) => layer.id === snapshot.textureActiveId
    );
    if (!activeLayer || activeLayer.kind === 'effect') {
      return false;
    }
    const faces =
      snapshot.selectionMode === 'face' ? snapshot.selectedElements.length : 0;
    return faces > 0 || snapshot.uvSelectedCorners.length > 0;
  });

</script>

<div class="paint-toolbar">
  <div class="paint-tools" role="group" aria-label="Paint tool">
    {#each tools as item (item.tool)}
      <IconButton
        label={commandTooltipFor(item.command)}
        icon={item.icon}
        active={session.snapshot.paintTool === item.tool}
        tooltip={commandTooltipFor(item.command)}
        shortcut={item.key}
        tooltipPlacement="bottom"
        onActivate={() => session.setPaintTool(item.tool)}
      />
    {/each}
  </div>
  <div class="paint-brush-row">
  <div class="paint-color-pair">
    <PaintColorSwatch
      label={session.snapshot.paintTool === 'gradient' ? 'From' : 'Color'}
      color={session.snapshot.uvBrushColor}
      alpha={session.snapshot.uvBrushColorAlpha}
      onColor={(color) => session.setUvBrushColor(color)}
      onAlpha={(alpha) => session.setUvBrushColorAlpha(alpha)}
      onEyedropper={() => session.beginPaintEyedropper('primary')}
    />
    {#if session.snapshot.paintTool === 'gradient'}
      <span class="paint-gradient-preview" aria-hidden="true">
        <span style:background={gradientPreview}></span>
      </span>
      <PaintColorSwatch
        label="To"
        color={session.snapshot.paintSecondaryColor}
        alpha={session.snapshot.paintSecondaryColorAlpha}
        onColor={(color) => session.setPaintSecondaryColor(color)}
        onAlpha={(alpha) => session.setPaintSecondaryColorAlpha(alpha)}
        onEyedropper={() => session.beginPaintEyedropper('secondary')}
      />
    {/if}
  </div>
  {#if session.snapshot.paintTool !== 'gradient'}
    <BrushPreview {settings} />
  {/if}
  <span class="paint-size">{session.snapshot.uvBrushSize} texels</span>
  <span class="paint-divider" aria-hidden="true"></span>
  <IconButton
    label="Fill selected faces or UV islands"
    icon="fill-selection"
    tooltip="Fill selected faces or UV islands"
    tooltipPlacement="bottom"
    disabled={!canFillSelection}
    onActivate={() => session.fillPaintSelection()}
  />
  <IconButton
    label={session.snapshot.paintUvOverlay ? 'Hide UV overlay' : 'Show UV overlay'}
    icon={session.snapshot.paintUvOverlay ? 'eye' : 'eye-off'}
    active={session.snapshot.paintUvOverlay}
    pressed={session.snapshot.paintUvOverlay}
    tooltip={session.snapshot.paintUvOverlay ? 'Hide UV overlay' : 'Show UV overlay'}
    tooltipPlacement="bottom"
    disabled={!session.snapshot.activeNodeId}
    onActivate={() => session.togglePaintUvOverlay()}
  />
  <span class="paint-divider" aria-hidden="true"></span>
  <IconButton
    label="Zoom out"
    icon="minus"
    tooltip="Zoom texture out"
    tooltipPlacement="bottom"
    onActivate={() => session.zoomPaintCenter(1 / 1.25)}
  />
  <IconButton
    label="Fit texture"
    icon="frame"
    tooltip="Fit texture"
    tooltipPlacement="bottom"
    onActivate={() => session.resetPaintView()}
  />
  <IconButton
    label="Zoom in"
    icon="plus"
    tooltip="Zoom texture in"
    tooltipPlacement="bottom"
    onActivate={() => session.zoomPaintCenter(1.25)}
  />
  <span class="paint-size">{Math.round(session.snapshot.paintZoom * 100)}%</span>
  </div>
</div>

<style>
  .paint-toolbar {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: var(--hit-min);
  }

  .paint-toolbar::-webkit-scrollbar {
    display: none;
  }

  .paint-tools,
  .paint-brush-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .paint-tools {
    gap: 1px;
  }

  .paint-color-pair {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--space-1);
  }

  .paint-gradient-preview {
    position: relative;
    display: block;
    width: 42px;
    height: 18px;
    overflow: hidden;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    background:
      linear-gradient(45deg, var(--bg-raised) 25%, transparent 25%) 0 0 / 8px 8px,
      linear-gradient(-45deg, var(--bg-raised) 25%, transparent 25%) 0 4px / 8px 8px,
      linear-gradient(45deg, transparent 75%, var(--bg-raised) 75%) 4px -4px / 8px 8px,
      linear-gradient(-45deg, transparent 75%, var(--bg-raised) 75%) -4px 0 / 8px 8px,
      var(--bg-input);
  }

  .paint-gradient-preview > span {
    position: absolute;
    inset: 0;
  }

  .paint-divider {
    flex: 0 0 auto;
    width: 1px;
    height: 24px;
    background: var(--border-subtle);
  }

  .paint-size {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }
</style>
