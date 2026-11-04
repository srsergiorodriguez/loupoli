<script lang="ts">
  import IconButton from '../Primitives/IconButton.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type { AnimationTrackSummary } from '../../editor/types';

  /** Animation transport and scrubbable keyframe lane. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  let scrubbing = $state(false);

  const snapshot = $derived(session.snapshot);
  const start = $derived(snapshot.animationStartFrame);
  const end = $derived(Math.max(start + 1, snapshot.animationEndFrame));
  const span = $derived(Math.max(1, end - start));
  const activeTargetId = $derived(
    snapshot.activeGroupId ?? snapshot.activeNodeId
  );
  const activeTrack = $derived(
    snapshot.animationTracks.find((track) => track.targetId === activeTargetId) ??
      null
  );
  const keyDisabled = $derived(activeTargetId === null);

  function percent(frame: number): number {
    return Math.max(0, Math.min(100, ((frame - start) / span) * 100));
  }

  function frameAt(clientX: number, element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(start + ratio * span);
  }

  function scrub(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement;
    session.setAnimationFrame(frameAt(event.clientX, target));
  }

  function beginScrub(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement;
    if (event.button !== 0) {
      return;
    }
    scrubbing = true;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort.
    }
    scrub(event);
  }

  function moveScrub(event: PointerEvent): void {
    if (scrubbing) {
      scrub(event);
    }
  }

  function endScrub(event: PointerEvent): void {
    if (!scrubbing) {
      return;
    }
    scrubbing = false;
    scrub(event);
  }

  function selectTrack(track: AnimationTrackSummary): void {
    if (track.targetKind === 'node') {
      session.selectNode(track.targetId);
    } else {
      session.selectGroup(track.targetId);
    }
  }

  function selectKey(track: AnimationTrackSummary, frame: number): void {
    selectTrack(track);
    session.setAnimationFrame(frame);
  }
</script>

<section class="animation-timeline loupoli-panel" aria-label="Animation timeline">
  <div class="timeline-head">
    <div class="timeline-transport">
      <IconButton
        label={snapshot.animationPlaying ? 'Pause animation' : 'Play animation'}
        icon={snapshot.animationPlaying ? 'pause' : 'play'}
        tooltip={snapshot.animationPlaying ? 'Pause' : 'Play'}
        onActivate={() =>
          snapshot.animationPlaying
            ? session.pauseAnimation()
            : session.playAnimation()}
      />
      <ActionButton
        label="Key"
        icon="plus"
        disabled={keyDisabled}
        onActivate={() => session.keyActiveTransform()}
      />
    </div>
    <div class="timeline-readout">
      <strong>{Math.round(snapshot.animationFrame)}</strong>
      <span>/ {end} f</span>
      <span>{snapshot.animationFps} fps</span>
      {#if activeTrack}
        <span class="timeline-target">{activeTrack.targetName}</span>
      {/if}
    </div>
  </div>

  <div class="timeline-ruler" aria-hidden="true">
    {#each [0, 0.25, 0.5, 0.75, 1] as ratio (ratio)}
      <span style:left={`${ratio * 100}%`}>{Math.round(start + ratio * span)}</span>
    {/each}
  </div>

  <div
    class="timeline-tracks"
    class:scrubbing
    role="group"
    aria-label="Animation tracks"
    onpointerdown={beginScrub}
    onpointermove={moveScrub}
    onpointerup={endScrub}
    onpointercancel={() => (scrubbing = false)}
  >
    <span
      class="timeline-playhead"
      style:left={`${percent(snapshot.animationFrame)}%`}
      aria-hidden="true"
    ></span>
    {#if snapshot.animationTracks.length === 0}
      <p class="timeline-empty">
        Select an object or group, set a frame, and press Key.
      </p>
    {:else}
      {#each snapshot.animationTracks as track (track.id)}
        <div
          class="timeline-track"
          class:active={activeTrack?.id === track.id}
          role="button"
          tabindex="0"
          onclick={() => selectTrack(track)}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectTrack(track);
            }
          }}
        >
          <span class="track-name">{track.targetName}</span>
          <span class="track-lane">
            {#each track.keyframes as key (key.frame)}
              <button
                type="button"
                class="track-key"
                class:selected={Math.round(snapshot.animationFrame) === key.frame}
                style:left={`${percent(key.frame)}%`}
                aria-label={`Go to frame ${key.frame}`}
                onclick={(event) => {
                  event.stopPropagation();
                  selectKey(track, key.frame);
                }}
              ></button>
            {/each}
          </span>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .animation-timeline {
    position: absolute;
    right: 12px;
    bottom: 12px;
    left: 12px;
    z-index: 6;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 8px 10px 10px;
    pointer-events: auto;
  }

  .timeline-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--hit-min);
  }

  .timeline-transport {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .timeline-readout {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }

  .timeline-readout strong {
    color: var(--accent-primary);
    font-size: var(--text-sm);
  }

  .timeline-target {
    max-width: 20ch;
    overflow: hidden;
    color: var(--text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timeline-ruler {
    position: relative;
    height: 14px;
    margin: 2px 0 3px;
    border-bottom: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 9px;
  }

  .timeline-ruler span {
    position: absolute;
    bottom: 2px;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .timeline-ruler span:first-child {
    transform: none;
  }

  .timeline-ruler span:last-child {
    transform: translateX(-100%);
  }

  .timeline-tracks {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 28px;
    max-height: 110px;
    padding-top: 2px;
    overflow-y: auto;
    cursor: ew-resize;
    touch-action: none;
  }

  .timeline-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--accent-primary);
    box-shadow: 0 0 6px color-mix(in srgb, var(--accent-primary) 50%, transparent);
    pointer-events: none;
  }

  .timeline-empty {
    margin: 6px 0;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .timeline-track {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-height: 20px;
    padding: 1px 4px;
    border-radius: var(--radius-xs);
  }

  .timeline-track.active {
    background: var(--bg-selected);
  }

  .track-name {
    overflow: hidden;
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-lane {
    position: relative;
    display: block;
    height: 18px;
    border-left: var(--hairline) solid var(--border-subtle);
    border-right: var(--hairline) solid var(--border-subtle);
  }

  .track-key {
    position: absolute;
    top: 50%;
    width: 11px;
    height: 11px;
    margin: -5.5px 0 0 -5.5px;
    padding: 0;
    border: 1px solid var(--accent-primary);
    border-radius: 2px;
    background: var(--bg-input);
    transform: rotate(45deg);
    cursor: pointer;
  }

  .track-key.selected {
    background: var(--accent-primary);
  }

  :global(:root[data-density='touch']) .track-key {
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
  }
</style>
