<script lang="ts">
  /** Size of the loupoli cube mark. */
  interface Props {
    size?: number;
  }

  let { size = 22 }: Props = $props();
</script>

<img
  class="brand-mark"
  src={`${import.meta.env.BASE_URL}loupoli-logo.svg`}
  width={size}
  height={size}
  alt=""
  aria-hidden="true"
  draggable="false"
/>

<style>
  .brand-mark {
    display: block;
    flex: none;
  }
</style>
