<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Session projection used by the status strip. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  const counts = $derived(
    session.snapshot.modifiersActive
      ? session.snapshot.evaluatedCounts
      : session.snapshot.counts
  );
  const selectedElements = $derived(session.snapshot.selectedElements);
  const selectionCount = $derived(selectedElements.length);
  const pointer = $derived(session.snapshot.pointer);

  const modeLabel = $derived(
    session.snapshot.selectionMode === 'vertex'
      ? 'Vertex'
      : session.snapshot.selectionMode === 'edge'
        ? 'Edge'
        : 'Face'
  );
  const modePlural = $derived(
    session.snapshot.selectionMode === 'vertex'
      ? 'vertices'
      : session.snapshot.selectionMode === 'edge'
        ? 'edges'
        : 'faces'
  );

  const dynamicHint = $derived.by(() => {
    if (pointer?.type === 'pen') {
      const pressure = Math.round(pointer.pressure * 100);
      return `Pen · ${pressure}% pressure · tilt ${Math.round(pointer.tiltX)}° / ${Math.round(pointer.tiltY)}°`;
    }
    if (session.snapshot.nodes.length === 0) {
      return 'Scene empty · add a primitive in the inspector';
    }
    if (session.snapshot.uvOpen) {
      if (session.snapshot.uvPaintMode) {
        return `Paint · active layer · ${session.snapshot.uvBrushSize}px brush`;
      }
      const count = session.snapshot.uvSelectedCorners.length;
      const mode =
        session.snapshot.uvTransformMode === 'rotate'
          ? 'rotate'
          : session.snapshot.uvTransformMode === 'scale'
            ? 'scale'
            : 'move';
      return count > 0
        ? `UV · ${count} corner${count === 1 ? '' : 's'} · drag to ${mode}${mode === 'rotate' ? '' : ' · U/V lock'}`
        : 'UV · select 3D faces or click UV corners';
    }
    if (session.snapshot.modifiersActive) {
      return 'Modifiers active · base edits re-evaluate · gizmo uses base median';
    }
    if (selectionCount === 1) {
      if (session.snapshot.selectionMode === 'vertex') {
        const axis = session.snapshot.axisLock;
        return axis
          ? `Vertex ${selectedElements[0] + 1} · ${axis.toUpperCase()} axis · drag or use the gizmo`
          : `Vertex ${selectedElements[0] + 1} selected · drag or use the gizmo`;
      }
      return `${modeLabel} ${selectedElements[0] + 1} selected · Move/Rotate/Scale gizmo`;
    }
    if (selectionCount > 1) {
      return `${selectionCount} ${modePlural} selected · Move/Rotate/Scale gizmo`;
    }
    return '';
  });
</script>

<footer class="status-bar" aria-label="Status">
  <div class="status-cell status-hint">
    {#if dynamicHint}
      <span>{dynamicHint}</span>
    {:else}
      <span class="hint-desktop">Drag orbit · Move/Rotate/Scale gizmo · E/I actions · Add/Shift select · F frame</span>
      <span class="hint-touch">Tap select · Pencil gizmo/actions · 1-finger orbit · 2-finger pan/zoom · 2/3-finger undo/redo</span>
    {/if}
  </div>

  <div class="status-cell status-counts text-mono" aria-label="Mesh counts">
    <span>{counts.vertices} V</span>
    <span class="count-separator">·</span>
    <span>{counts.edges} E</span>
    <span class="count-separator">·</span>
    <span>{counts.faces} F</span>
    <span class="count-separator">·</span>
    <span>{counts.triangles} T</span>
  </div>

  <div class="status-cell status-state text-mono">
    {#if session.snapshot.snapEnabled}
      <span class="snap-status">Snap {session.snapshot.snapStep}</span>
      <span class="state-separator" aria-hidden="true"></span>
    {/if}
    <span class="state-dot" aria-hidden="true"></span>
    <span>On-demand</span>
    <span class="state-separator" aria-hidden="true"></span>
    <span class="renderer-label">WebGL2</span>
  </div>
</footer>

<style>
  .status-bar {
    position: fixed;
    z-index: var(--z-chrome);
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    height: calc(var(--status-h) + var(--safe-bottom));
    padding:
      0 calc(var(--safe-right) + var(--space-3))
      var(--safe-bottom) calc(var(--safe-left) + var(--space-3));
    border-top: var(--hairline) solid var(--border-subtle);
    background: var(--bg-panel);
    -webkit-backdrop-filter: blur(var(--blur-panel));
    backdrop-filter: blur(var(--blur-panel));
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .status-cell {
    min-width: 0;
  }

  .status-hint {
    overflow: hidden;
    color: var(--text-tertiary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint-touch {
    display: none;
  }

  .status-counts {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-secondary);
  }

  .count-separator {
    color: var(--text-disabled);
  }

  .status-state {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
  }

  .state-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent-primary);
  }

  .state-separator {
    display: block;
    width: 1px;
    height: 10px;
    background: var(--border-subtle);
  }

  .renderer-label {
    color: var(--text-tertiary);
  }

  @media (pointer: coarse) {
    .hint-desktop {
      display: none;
    }

    .hint-touch {
      display: inline;
    }
  }

  @media (max-width: 1050px) {
    .status-counts {
      display: none;
    }

    .status-bar {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }

  @media (max-width: 620px) {
    .status-state {
      gap: 6px;
    }

    .renderer-label,
    .state-separator {
      display: none;
    }
  }
</style>
