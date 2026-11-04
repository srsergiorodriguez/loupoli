<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type { PaintTool } from '../../paint/types';
  import type { IconName } from '../Icons/types';
  import IconButton from '../Primitives/IconButton.svelte';
  import BrushPreview from './BrushPreview.svelte';
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

  const settings = $derived({
    tool: session.snapshot.paintTool,
    color: session.snapshot.uvBrushColor,
    secondaryColor: session.snapshot.paintSecondaryColor,
    radius: session.snapshot.uvBrushSize / 2,
    opacity: session.snapshot.uvBrushOpacity,
    hardness: session.snapshot.paintHardness,
    smoothing: session.snapshot.paintSmoothing,
    noise: session.snapshot.paintNoise,
    spacing: 0.25,
    shapeFilled: session.snapshot.paintShapeFilled,
    gradient: session.snapshot.paintGradient
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
  <label class="paint-color" title="Brush color">
    <input
      type="color"
      value={session.snapshot.uvBrushColor}
      aria-label="Brush color"
      onchange={(event) => session.setUvBrushColor(event.currentTarget.value)}
    />
  </label>
  <BrushPreview {settings} />
  <span class="paint-size">{session.snapshot.uvBrushSize} px</span>
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

  .paint-color input {
    width: var(--hit-min);
    height: var(--control-h);
    padding: 0;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
  }

  .paint-size {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }
</style>
