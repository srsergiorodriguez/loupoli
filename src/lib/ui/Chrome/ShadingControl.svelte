<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type { ShadingMode } from '../../editor/types';

  /** Session projection for the shading selector. */
  interface Props {
    session: EditorSession;
  }

  /** One selectable shading mode and its compact label/icon. */
  interface ShadingChoice {
    mode: ShadingMode;
    label: string;
    icon: IconName;
  }

  let { session }: Props = $props();

  const choices: readonly ShadingChoice[] = [
    { mode: 'wireframe', label: 'Wireframe', icon: 'wire' },
    { mode: 'solid', label: 'Solid', icon: 'solid' },
    { mode: 'unlit', label: 'Texture', icon: 'unlit' },
    { mode: 'texture-wire', label: 'Texture + Wire', icon: 'texture-wire' },
    { mode: 'lit', label: 'Lit', icon: 'lit' }
  ];
</script>

<div class="shading-control loupoli-panel" role="group" aria-label="Viewport shading">
  {#each choices as choice (choice.mode)}
    <button
      type="button"
      class:active={session.snapshot.shading === choice.mode}
      aria-pressed={session.snapshot.shading === choice.mode}
      aria-label={choice.label}
      title={choice.label}
      onclick={() => session.setShading(choice.mode)}
    >
      <Icon name={choice.icon} size={16} />
    </button>
  {/each}
</div>

<style>
  .shading-control {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-md);
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: var(--control-h-sm);
    width: var(--hit-min);
    min-width: var(--hit-min);
    padding: 0;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    line-height: 1;
    transition:
      background-color var(--motion-instant) var(--ease-out),
      color var(--motion-instant) var(--ease-out);
  }

  button:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  button.active {
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  button.active:hover {
    color: var(--accent-primary-hover);
  }


  :global(:root[data-density='touch']) .shading-control {
    padding: 4px;
  }

  :global(:root[data-density='touch']) button {
    width: var(--hit-min);
    min-width: var(--hit-min);
    height: var(--hit-min);
    padding: 0;
  }
</style>
