<script lang="ts">
  import ToolButton from '../Primitives/ToolButton.svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type { TransformMode } from '../../editor/types';

  /** Session projection and viewport-focus callback for the tool rail. */
  interface Props {
    session: EditorSession;
    onFocusViewport: () => void;
  }

  let { session, onFocusViewport }: Props = $props();

  function selectTool(): void {
    onFocusViewport();
    session.closeInspector();
    session.setTransformMode('select');
  }

  function chooseTransform(mode: TransformMode): void {
    onFocusViewport();
    session.closeInspector();
    session.setTransformMode(mode);
  }

  function frameMesh(): void {
    onFocusViewport();
    session.frameSelection();
  }
</script>

<nav class="tool-rail loupoli-panel" aria-label="Modeling tools">
  <div class="tool-group">
    <ToolButton
      label="Select"
      icon="cursor"
      active={session.snapshot.transformMode === 'select'}
      onActivate={selectTool}
    />
  </div>
  <span class="rail-divider" aria-hidden="true"></span>
  <div class="tool-group">
    <ToolButton
      label="Move"
      icon="move"
      active={session.snapshot.transformMode === 'translate'}
      onActivate={() => chooseTransform('translate')}
    />
    <ToolButton
      label="Rotate"
      icon="rotate"
      active={session.snapshot.transformMode === 'rotate'}
      onActivate={() => chooseTransform('rotate')}
    />
    <ToolButton
      label="Scale"
      icon="scale"
      active={session.snapshot.transformMode === 'scale'}
      onActivate={() => chooseTransform('scale')}
    />
  </div>
  <span class="rail-divider" aria-hidden="true"></span>
  <div class="tool-group">
    <ToolButton label="Frame" icon="frame" onActivate={frameMesh} />
  </div>
</nav>

<style>
  .tool-rail {
    position: fixed;
    z-index: var(--z-chrome);
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
    left: calc(var(--safe-left) + var(--space-3));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    width: var(--toolrail-w);
    padding: var(--space-1) 0;
    border-radius: var(--radius-lg);
  }

  .tool-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .rail-divider {
    width: 24px;
    height: 1px;
    margin: var(--space-1) 0;
    background: var(--border-subtle);
  }

  @media (max-width: 899px) {
    .tool-rail {
      top: auto;
      left: 50%;
      bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
      flex-direction: row;
      width: auto;
      padding: var(--space-1) var(--space-2);
      transform: translateX(-50%);
      border-radius: var(--radius-xl);
    }

    .tool-group {
      flex-direction: row;
      width: auto;
    }

    .rail-divider {
      width: 1px;
      height: 28px;
      margin: 0 var(--space-1);
    }
  }
</style>
