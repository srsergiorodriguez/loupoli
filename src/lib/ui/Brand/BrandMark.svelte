<script lang="ts">
  /** Size of the lowercase folded-mark brand glyph. */
  interface Props {
    size?: number;
  }

  let { size = 22 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  <path d="M4 3.5h6v11.6h10v5.4H4V3.5Z" fill="var(--accent-primary)" />
  <path d="M10 3.5 12.5 6v9.1H10V3.5Z" fill="var(--accent-primary)" opacity=".55" />
  <path d="M10 15.1h10L17.5 20.5H10v-5.4Z" fill="var(--accent-primary)" opacity=".45" />
</svg>
