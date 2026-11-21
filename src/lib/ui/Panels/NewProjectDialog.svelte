<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';

  /** Confirmation for replacing the current project. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
</script>

{#snippet actions()}
    <ActionButton label="Cancel" onActivate={() => session.cancelNewProject()} />
    <ActionButton
      label="New project"
      icon="new-file"
      variant="primary"
      onActivate={() => session.confirmNewProject()}
    />
{/snippet}

<ModalDialog
  title="Start a new project?"
  kicker="Project"
  width="420px"
  onClose={() => session.cancelNewProject()}
  {actions}
>
  <p>
    This will discard the current <strong>{session.snapshot.projectName}</strong> project and
    its unsaved changes.
  </p>
  <p class="hint">Save a copy first if you want to keep it.</p>
</ModalDialog>

<style>
  p {
    margin: 0;
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  strong {
    color: var(--text-primary);
    font-weight: var(--weight-medium);
  }

  .hint {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

</style>
