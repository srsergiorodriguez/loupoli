<script lang="ts">
  import ActionMenu, { type ActionMenuOption } from './ActionMenu.svelte';

  /** Standard icon-only overflow menu for reusable inspector actions. */
  interface Props {
    options: readonly ActionMenuOption[];
    menuTitle?: string;
    align?: 'start' | 'end';
    disabled?: boolean;
  }

  let {
    options,
    menuTitle = '',
    align = 'end',
    disabled = false
  }: Props = $props();
</script>

<ActionMenu
  icon="more"
  {options}
  {menuTitle}
  {align}
  {disabled}
/>
