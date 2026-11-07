<script lang="ts">
  import { onMount } from 'svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import SelectField from '../Primitives/SelectField.svelte';
  import {
    imageFitRect,
    type ImageFitMode,
    type ImageFitOptions
  } from '../../texture/imageFit';

  /** Fit-image options shown after choosing a texture image. */
  interface Props {
    file: File;
    textureWidth: number;
    textureHeight: number;
    onCancel: () => void;
    onImport: (fit: ImageFitOptions) => void;
  }

  let { file, textureWidth, textureHeight, onCancel, onImport }: Props = $props();
  let mode = $state<ImageFitMode>('contain');
  let canvas = $state<HTMLCanvasElement>();
  let bitmap = $state<ImageBitmap | null>(null);
  let loadError = $state<string | null>(null);

  onMount(() => {
    let disposed = false;
    createImageBitmap(file)
      .then((next) => {
        if (disposed) {
          next.close();
          return;
        }
        bitmap = next;
        draw();
      })
      .catch(() => {
        loadError = 'The source image could not be decoded.';
      });
    return () => {
      disposed = true;
      bitmap?.close();
    };
  });

  $effect(() => {
    mode;
    draw();
  });

  function draw(): void {
    const target = canvas;
    const image = bitmap;
    if (!target || !image) {
      return;
    }
    const width = 360;
    const height = 180;
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
    const context = target.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#121214';
    context.fillRect(0, 0, width, height);

    const textureAspect = textureWidth / Math.max(1, textureHeight);
    const frameWidth = Math.min(width - 16, height * textureAspect);
    const frameHeight = frameWidth / textureAspect;
    const frameX = (width - frameWidth) / 2;
    const frameY = (height - frameHeight) / 2;
    const cell = 10;
    for (let y = 0; y < frameHeight; y += cell) {
      for (let x = 0; x < frameWidth; x += cell) {
        context.fillStyle =
          (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0
            ? '#263129'
            : '#c8c2ad';
        context.fillRect(
          frameX + x,
          frameY + y,
          Math.min(cell, frameWidth - x),
          Math.min(cell, frameHeight - y)
        );
      }
    }
    const rect = imageFitRect(
      image.width,
      image.height,
      textureWidth,
      textureHeight,
      { mode }
    );
    const scaleX = frameWidth / textureWidth;
    const scaleY = frameHeight / textureHeight;
    context.imageSmoothingEnabled = true;
    context.drawImage(
      image,
      frameX + rect.x * scaleX,
      frameY + rect.y * scaleY,
      rect.width * scaleX,
      rect.height * scaleY
    );
    context.strokeStyle = 'rgba(232, 228, 216, 0.45)';
    context.strokeRect(frameX + 0.5, frameY + 0.5, frameWidth - 1, frameHeight - 1);
  }

  const modeHint = $derived(
    mode === 'contain'
      ? 'Show the whole image with transparent margins.'
      : mode === 'cover'
        ? 'Fill the texture and crop the overflow.'
        : mode === 'stretch'
          ? 'Fill the texture exactly, distorting the aspect.'
          : 'Draw at one image pixel per texture pixel.'
  );
</script>

<ModalDialog
  title="Import image"
  kicker="Texture"
  width="460px"
  onClose={onCancel}
>
  <p class="hint">
    {file.name} · {textureWidth} × {textureHeight} texture
  </p>
  <canvas bind:this={canvas} class="preview" aria-label="Image fit preview"></canvas>
  <SelectField
    label="Fit"
    value={mode}
    options={[
      { value: 'contain', label: 'Contain' },
      { value: 'cover', label: 'Cover' },
      { value: 'stretch', label: 'Stretch' },
      { value: 'native', label: 'Native' }
    ]}
    onChange={(value) => (mode = value as ImageFitMode)}
  />
  <p class="hint">{modeHint} The image becomes a new raster layer.</p>
  {#if loadError}
    <p class="error">{loadError}</p>
  {/if}

  {#snippet actions()}
    <ActionRow align="end">
      <ActionButton label="Cancel" onActivate={onCancel} />
      <ActionButton
        label="Import image"
        icon="image"
        disabled={bitmap === null}
        onActivate={() => onImport({ mode })}
      />
    </ActionRow>
  {/snippet}
</ModalDialog>

<style>
  .hint,
  .error {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }

  .error {
    color: var(--accent-warning);
  }

  .preview {
    display: block;
    width: 100%;
    height: auto;
    margin: var(--space-3) 0;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-canvas);
  }
</style>
