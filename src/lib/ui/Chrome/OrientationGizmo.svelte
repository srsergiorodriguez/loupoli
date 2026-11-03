<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type { AxisName } from '../../render/CameraRig';

  /** Session projection for the camera-orientation gizmo. */
  interface Props {
    session: EditorSession;
  }

  /** Theme color and label for one world axis. */
  interface AxisStyle {
    color: string;
    label: string;
  }

  let { session }: Props = $props();

  const axisStyles: Record<AxisName, AxisStyle> = {
    x: { color: 'var(--axis-x)', label: 'X' },
    y: { color: 'var(--axis-y)', label: 'Y' },
    z: { color: 'var(--axis-z)', label: 'Z' }
  };

  const sortedAxes = $derived(
    [...session.snapshot.orientation].sort((a, b) => a.depth - b.depth)
  );

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let dragged = false;
  let suppressClickUntil = 0;

  function handlePointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastX = event.clientX;
    lastY = event.clientY;
    dragged = false;
    const target = event.currentTarget as HTMLButtonElement;
    target.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (
      !dragged &&
      Math.hypot(event.clientX - startX, event.clientY - startY) > 3
    ) {
      dragged = true;
    }
    if (!dragged) {
      return;
    }
    lastX = event.clientX;
    lastY = event.clientY;
    session.orbitView(dx, dy);
    event.preventDefault();
  }

  function handlePointerUp(event: PointerEvent): void {
    if (pointerId !== event.pointerId) {
      return;
    }
    pointerId = null;
    if (dragged) {
      suppressClickUntil = performance.now() + 400;
      dragged = false;
    }
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (pointerId === event.pointerId) {
      pointerId = null;
      dragged = false;
    }
  }

  function handleClick(event: MouseEvent): void {
    if (event.detail !== 0 && performance.now() < suppressClickUntil) {
      return;
    }
    // Keyboard activation has no useful screen coordinates; use it to frame.
    if (event.detail === 0) {
      session.frameSelection();
      return;
    }

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pointerX = event.clientX - centerX;
    const pointerY = event.clientY - centerY;
    const radius = Math.min(rect.width, rect.height) * 0.3;
    const hitRadius = Math.min(28, Math.max(18, rect.width * 0.26));

    if (Math.hypot(pointerX, pointerY) < rect.width * 0.12) {
      session.frameSelection();
      return;
    }

    let bestAxis: AxisName | null = null;
    let bestSign: 1 | -1 = 1;
    let bestDistance = hitRadius;

    for (const axis of sortedAxes) {
      const projectedLength = Math.hypot(axis.x, axis.y);
      if (projectedLength < 0.18) {
        continue;
      }
      const positiveX = axis.x * radius;
      const positiveY = axis.y * radius;
      const positiveDistance = Math.hypot(
        pointerX - positiveX,
        pointerY - positiveY
      );
      const negativeDistance = Math.hypot(
        pointerX + positiveX,
        pointerY + positiveY
      );

      if (positiveDistance < bestDistance) {
        bestAxis = axis.axis;
        bestSign = 1;
        bestDistance = positiveDistance;
      }
      if (negativeDistance < bestDistance) {
        bestAxis = axis.axis;
        bestSign = -1;
        bestDistance = negativeDistance;
      }
    }

    if (bestAxis) {
      session.snapView(bestAxis, bestSign);
    }
  }
</script>

<button
  type="button"
  class="orientation-gizmo"
  aria-label="Orientation gizmo. Drag to orbit. Click a signed axis to view that side; click the center to frame the active object."
  onclick={handleClick}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
>
  <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle class="orbit-ring" cx="50" cy="50" r="41" />
    {#each sortedAxes as axis (axis.axis)}
      {@const style = axisStyles[axis.axis]}
      {@const x = axis.x * 29}
      {@const y = axis.y * 29}
      <g
        style={`--axis-color: ${style.color}; --axis-opacity: ${axis.depth < 0 ? 0.5 : 1}`}
      >
        <line
          class="axis-line"
          x1="50"
          y1="50"
          x2={50 + x}
          y2={50 + y}
        />
        <circle class="axis-dot" cx={50 - x} cy={50 - y} r="1.7" />
        <circle class="axis-endpoint" cx={50 + x} cy={50 + y} r="8" />
        <text
          class="axis-label"
          x={50 + x}
          y={50 + y + 0.2}
          text-anchor="middle"
          dominant-baseline="central">{style.label}</text>
        <circle
          class="axis-negative-endpoint"
          cx={50 - x}
          cy={50 - y}
          r="5.2"
        />
        <text
          class="axis-negative-label"
          x={50 - x}
          y={50 - y + 0.2}
          text-anchor="middle"
          dominant-baseline="central">−{style.label}</text>
      </g>
    {/each}
    <circle class="center" cx="50" cy="50" r="2.4" />
  </svg>
</button>
<style>
  .orientation-gizmo {
    display: block;
    width: var(--gizmo-size);
    height: var(--gizmo-size);
    padding: 0;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: 50%;
    background: var(--bg-panel);
    box-shadow: var(--shadow-panel);
    color: var(--text-secondary);
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-backdrop-filter: blur(var(--blur-panel)) saturate(1.08);
    backdrop-filter: blur(var(--blur-panel)) saturate(1.08);
    transition:
      background-color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }

  .orientation-gizmo:hover {
    border-color: var(--border-strong);
    background: var(--bg-panel-strong);
  }

  .orientation-gizmo:active {
    cursor: grabbing;
  }

  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .orbit-ring {
    fill: transparent;
    stroke: var(--border-subtle);
    stroke-width: 0.8;
    stroke-dasharray: 1 3;
  }

  .axis-line {
    stroke: var(--axis-color);
    stroke-width: 1.2;
    opacity: var(--axis-opacity);
  }

  .axis-dot {
    fill: var(--axis-color);
    opacity: calc(var(--axis-opacity) * 0.5);
  }

  .axis-endpoint {
    fill: var(--axis-color);
    opacity: var(--axis-opacity);
  }

  .axis-negative-endpoint {
    fill: var(--axis-color);
    opacity: calc(var(--axis-opacity) * 0.36);
  }

  .axis-negative-label {
    fill: var(--axis-color);
    opacity: calc(var(--axis-opacity) * 0.72);
    font-family: var(--font-mono);
    font-size: 7px;
    font-weight: var(--weight-medium);
    pointer-events: none;
  }

  .axis-label {
    fill: var(--bg-canvas);
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: var(--weight-semibold);
    pointer-events: none;
  }

  .center {
    fill: var(--text-secondary);
  }

  :global(:root[data-density='touch']) .orientation-gizmo {
    width: var(--gizmo-size-touch);
    height: var(--gizmo-size-touch);
  }
</style>
