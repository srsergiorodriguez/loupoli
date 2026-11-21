<script lang="ts">
  import ActionButton from './ActionButton.svelte';
  import type { IconName } from '../Icons/types';

  /** End-aligned destructive action with a mandatory visible label. */
  interface Props {
    label: string;
    icon?: IconName;
    disabled?: boolean;
    onActivate?: () => void;
  }

  let { label, icon = 'trash', disabled = false, onActivate }: Props = $props();
</script>

<div class="danger-action">
  <ActionButton
    {label}
    {icon}
    variant="danger"
    {disabled}
    {onActivate}
  />
</div>

<style>
  .danger-action {
    display: flex;
    justify-content: flex-end;
  }
</style>
