<script lang="ts">
  import type { IconName } from './types';

  /** Props for one inline SVG glyph from the local registry. */
  interface Props {
    name: IconName;
    size?: number;
    strokeWidth?: number;
  }

  let { name, size = 18, strokeWidth = 1.6 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'cursor'}
    <path d="M5 3.5 18.5 11l-5.8 1.4L9.3 18 5 3.5Z" />
    <path d="M12.8 13.4 17 19.5" />
  {:else if name === 'frame'}
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <circle cx="12" cy="12" r="2.6" />
  {:else if name === 'undo'}
    <path d="M9 7 5 11l4 4" />
    <path d="M5 11h8.2a5 5 0 0 1 5 5v1" />
  {:else if name === 'redo'}
    <path d="m15 7 4 4-4 4" />
    <path d="M19 11h-8.2a5 5 0 0 0-5 5v1" />
  {:else if name === 'sliders'}
    <path d="M4 7h8M16 7h4M4 12h3M11 12h9M4 17h10M18 17h2" />
    <circle cx="14" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="16" cy="17" r="2" />
  {:else if name === 'wire'}
    <path d="M12 3 21 8.3 18.3 18H5.7L3 8.3 12 3Z" />
    <path d="M3 8.3h18M12 3v15M5.7 18 12 8.3 18.3 18" />
  {:else if name === 'solid'}
    <path
      d="M12 3 21 8.3 18.3 18H5.7L3 8.3 12 3Z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M12 3v15M3 8.3l9 4.7 9-4.7" stroke="rgba(0,0,0,.32)" />
  {:else if name === 'unlit'}
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path
      d="M4 12h8V4H4v8ZM12 12h8v8h-8v-8Z"
      fill="currentColor"
      stroke="none"
      opacity=".8"
    />
  {:else if name === 'texture-wire'}
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12h8V4H4v8ZM12 12h8v8h-8v-8Z" fill="currentColor" stroke="none" opacity=".45" />
    <path d="M4 20 20 4M4 4l16 16" />
  {:else if name === 'lit'}
    <circle cx="12" cy="12" r="3.7" />
    <path
      d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5"
    />

  {:else if name === 'camera'}
    <path d="M4 7.5h3l1.4-2h7.2L17 7.5h3v10H4z" />
    <circle cx="12" cy="12.5" r="3.2" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  {:else if name === 'lamp'}
    <path d="M8 4h8l3 8H5L8 4Z" />
    <path d="M12 12v7M8 21h8" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 10.5v6M12 7.5h.01" />
  {:else if name === 'book'}
    <path d="M4 5.5c2.8-1 6.8-1 8 1v13c-1.2-2-5.2-2-8-1v-13ZM20 5.5c-2.8-1-6.8-1-8 1v13c1.2-2 5.2-2 8-1v-13Z" />
  {:else if name === 'close'}
    <path d="m6 6 12 12M18 6 6 18" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'minus'}
    <path d="M5 12h14" />
  {:else if name === 'trash'}
    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />
  {:else if name === 'new-file'}
    <path d="M5 3.5h9l4 4V20H5V3.5Z" />
    <path d="M14 3.5V8h4M9 13h5M11.5 10.5v5" />
  {:else if name === 'open'}
    <path d="M3 7.5V6a1.5 1.5 0 0 1 1.5-1.5H9l2 2h7.5A1.5 1.5 0 0 1 20 8v1.5" />
    <path d="M3 9h18l-2.3 9H5.3L3 9Z" />
  {:else if name === 'save'}
    <path d="M5 4h12l2 2v14H5V4Z" />
    <path d="M8 4v6h8V4M8 20v-6h8v6" />
  {:else if name === 'move'}
    <path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
  {:else if name === 'rotate'}
    <path d="M20 8.5A8.5 8.5 0 1 0 20.5 14" />
    <path d="M20 3v5.5h-5.5" />
  {:else if name === 'scale'}
    <path d="M4 20 20 4M14 4h6v6M4 14v6h6" />
    <path d="M9 15 4 20" />
  {:else if name === 'merge'}
    <path d="M4 6h5l3 6 3-6h5M4 18h5l3-6 3 6h5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
  {:else if name === 'bridge'}
    <path d="M5 6v12M19 6v12M5 9h3c2 0 3 6 6 6s4-6 6-6h-1" />
  {:else if name === 'folder'}
    <path d="M3 6h7l2 2h9v11H3V6Z" />
  {:else if name === 'chevron-up'}
    <path d="m6 14 6-6 6 6" />
  {:else if name === 'chevron-down'}
    <path d="m6 10 6 6 6-6" />
  {:else if name === 'extrude'}
    <path d="M4 15h16M6 15V9h12v6M12 9V3M9 6l3-3 3 3" />
  {:else if name === 'inset'}
    <path d="M3 3h18v18H3V3ZM8 8h8v8H8V8Z" />
  {:else if name === 'loop-cut'}
    <path d="M4 12a8 8 0 1 1 16 0a8 8 0 0 1-16 0Z" />
    <path d="M4 12h16M12 4v16" />
  {:else if name === 'loop-slide'}
    <path d="M4 7c4-3 12-3 16 0M4 17c4-3 12-3 16 0" />
    <path d="M13 12h7M17 9l3 3-3 3" />
  {:else if name === 'seam'}
    <path d="M4 8h4M16 8h4M4 16h4M16 16h4" />
    <path d="M12 3v18" stroke-dasharray="2.5 3" />
  {:else if name === 'eye'}
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
    <circle cx="12" cy="12" r="2.7" />
  {:else if name === 'columns'}
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <path d="M12 4.5v15" />
  {:else if name === 'rows'}
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <path d="M3.5 12h17" />
  {:else if name === 'home'}
    <path d="m3.5 11 8.5-7 8.5 7" />
    <path d="M5.5 9.5V20h5v-5.5h3V20h5V9.5" />
  {:else if name === 'lasso'}
    <path d="M19.2 12.8c1.1 1.5.3 3.4-1.7 4.4-2.8 1.4-7.5 1.2-10.4-.5-2.2-1.3-2.6-3.5-.9-5.1 1.8-1.7 5.5-2.2 8.4-1.2 2.3.8 3.6 2.3 3.2 3.8-.3 1.2-1.8 2.1-3.6 2.1-1.8 0-3.3-.9-3.6-2.1" stroke-dasharray="2.5 2.5" />
    <path d="m14.5 15.8 4.8 4.7" />
  {:else if name === 'brush'}
    <path d="M5 19c2.6-.3 3.8-2.1 5.4-3.7L20 5.7a1.4 1.4 0 0 0-2-2l-9.6 9.6C6.8 14.9 5 16.1 5 19Z" />
    <path d="M5 19c2.6.2 4.2-1.4 5.4-3.7" />
  {:else if name === 'eraser'}
    <path d="m4 15 6.5-6.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H7l-3-3.2a1.5 1.5 0 0 1 0-1.8Z" />
    <path d="m10 9 6 6M12 19h8" />
  {:else if name === 'line'}
    <path d="M5 19 19 5" />
    <circle cx="5" cy="19" r="1.4" fill="currentColor" />
    <circle cx="19" cy="5" r="1.4" fill="currentColor" />
  {:else if name === 'rectangle'}
    <rect x="4.5" y="6.5" width="15" height="11" rx="1" />
  {:else if name === 'ellipse'}
    <ellipse cx="12" cy="12" rx="7.5" ry="5.5" />
  {:else if name === 'gradient'}
    <rect x="4.5" y="5.5" width="15" height="13" rx="1" />
    <path d="M4.5 16.5h15M4.5 12h15M4.5 7.5h15" opacity=".35" />
    <path d="M4.5 18.5h5M17.5 5.5h-5" />
  {:else if name === 'fill'}
    <path d="m7 4 9 9-5 5-7-7 3-7Z" />
    <path d="M13.5 19.5c2.3 0 3.5-1.2 3.5-2.8 0-1.2-1.1-2.6-1.7-3.2l-1.8 1.7c-.8 1-1.5 2.3-1.5 3.2 0 1.6 1.2 2.1 1.5 1.1Z" />
  {:else if name === 'more'}
    <circle cx="5" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" />
  {:else if name === 'pin'}
    <path d="m9 4 6 2-1.5 4 3.5 3.5-2 2L11.5 12 7 13.5 6 8l3-4Z" />
    <path d="m10 14-4 6" />
  {:else if name === 'unwrap'}
    <rect x="3.5" y="4.5" width="7" height="6" rx=".8" />
    <rect x="13.5" y="4.5" width="7" height="6" rx=".8" />
    <rect x="8.5" y="13.5" width="7" height="6" rx=".8" />
    <path d="M10.5 10.5v3M13.5 13.5l-2-2M17 10.5v3" />
  {:else if name === 'stack'}
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
  {:else if name === 'checker'}
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M4 12h8V4M12 12h8v8M12 12v8H4" />
  {:else if name === 'transparent'}
    <rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3" />
    <path d="m7 17 10-10M7 8h3v3M14 16h3v-3" />
  {:else if name === 'image'}
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <circle cx="9" cy="9" r="1.5" />
    <path d="m5 17 5-5 3 3 2-2 4 4" />
  {:else if name === 'sync'}
    <path d="M20 7v5h-5M4 17v-5h5" />
    <path d="M6.2 8a7 7 0 0 1 11.5-1.5L20 9M4 15l2.3 2.5A7 7 0 0 0 17.8 16" />
  {:else if name === 'play'}
    <path d="M8 5l10 7-10 7z" fill="currentColor" stroke="none" />
  {:else if name === 'pause'}
    <path d="M8 5v14M16 5v14" />
  {:else if name === 'lock'}
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
  {:else if name === 'eye-off'}
    <path d="M3 3l18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.4 2.9M6.2 7.1C4 8.8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  {/if}
</svg>
