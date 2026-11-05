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
  let selectedTrackId = $state<string | null>(null);
  let selectedKey = $state<{ trackId: string; frame: number } | null>(null);
  let keyDrag = $state<{
    track: AnimationTrackSummary;
    from: number;
    to: number;
    startX: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);

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
  const selectedTrack = $derived(
    snapshot.animationTracks.find((track) => track.id === selectedTrackId) ?? null
  );
  const readoutTrack = $derived(selectedTrack ?? activeTrack);
  const selectedKeyData = $derived.by(() => {
    const selection = selectedKey;
    if (!selection) {
      return null;
    }
    const track = snapshot.animationTracks.find(
      (item) => item.id === selection.trackId
    );
    const key = track?.keyframes.find(
      (item) => item.frame === selection.frame
    );
    return track && key ? { track, key } : null;
  });

  function percent(frame: number): number {
    return Math.max(0, Math.min(100, ((frame - start) / span) * 100));
  }

  function frameAt(clientX: number, element: HTMLElement): number {
    // The tracks container includes the 120 px name gutter. Scrub against the
    // first lane (or the playhead overlay when there are no tracks) so the
    // pointer, ruler labels, diamonds, and playhead share one coordinate space.
    const lane =
      element.querySelector<HTMLElement>('.track-lane') ??
      element.querySelector<HTMLElement>('.timeline-lane-overlay') ??
      element;
    const rect = lane.getBoundingClientRect();
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
    selectedTrackId = track.id;
    if (track.targetKind === 'node') {
      session.selectNode(track.targetId);
    } else {
      session.selectGroup(track.targetId);
    }
    if (track.kind === 'shape' && track.shapeKeyId) {
      session.selectShapeKey(track.shapeKeyId);
    }
  }

  function selectKey(track: AnimationTrackSummary, frame: number): void {
    selectTrack(track);
    selectedKey = { trackId: track.id, frame };
    session.setAnimationFrame(frame);
  }

  function keyTrack(track: AnimationTrackSummary): void {
    selectedTrackId = track.id;
    session.keyAnimationTrack(track);
  }

  function deleteSelectedKey(): void {
    if (!selectedKeyData) {
      return;
    }
    const { track, key } = selectedKeyData;
    session.deleteAnimationKeyAt(track, key.frame);
    selectedKey = null;
  }

  function beginKeyDrag(
    event: PointerEvent,
    track: AnimationTrackSummary,
    frame: number
  ): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectTrack(track);
    selectedKey = { trackId: track.id, frame };
    const element = event.currentTarget as HTMLElement;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort.
    }
    keyDrag = {
      track,
      from: frame,
      to: frame,
      startX: event.clientX,
      pointerId: event.pointerId,
      moved: false
    };
  }

  function moveKeyDrag(event: PointerEvent): void {
    const drag = keyDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (Math.abs(event.clientX - drag.startX) > 3) {
      drag.moved = true;
    }
    const lane = (event.currentTarget as HTMLElement).parentElement;
    if (!lane) {
      return;
    }
    const rect = lane.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))
    );
    drag.to = Math.round(start + ratio * span);
  }

  function endKeyDrag(event: PointerEvent): void {
    const drag = keyDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    keyDrag = null;
    if (drag.moved && drag.to !== drag.from) {
      session.moveAnimationKey(drag.track, drag.from, drag.to);
      selectedKey = { trackId: drag.track.id, frame: drag.to };
      selectedTrackId = drag.track.id;
    } else if (!drag.moved) {
      selectKey(drag.track, drag.from);
    }
  }

  function cancelKeyDrag(): void {
    keyDrag = null;
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
        label="Delete key"
        icon="trash"
        disabled={selectedKeyData === null}
        onActivate={deleteSelectedKey}
      />
    </div>
    <div class="timeline-readout">
      <strong>{Math.round(snapshot.animationFrame)}</strong>
      <span>/ {end} f</span>
      <span>{snapshot.animationFps} fps</span>
      {#if readoutTrack}
        <span class="timeline-target">{readoutTrack.targetName}</span>
      {/if}
    </div>
  </div>

  <div class="timeline-ruler" aria-hidden="true">
    <div class="timeline-ruler-lane">
      {#each [0, 0.25, 0.5, 0.75, 1] as ratio (ratio)}
        <span style:left={`${ratio * 100}%`}>{Math.round(start + ratio * span)}</span>
      {/each}
    </div>
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
    <span class="timeline-lane-overlay" aria-hidden="true">
      <span
        class="timeline-playhead"
        style:left={`${percent(snapshot.animationFrame)}%`}
      ></span>
    </span>
    {#if snapshot.animationTracks.length === 0}
      <p class="timeline-empty">
        Select an object or group. Use the + button on a track to add a key.
      </p>
    {:else}
      {#each snapshot.animationTracks as track (track.id)}
        <div
          class="timeline-track"
          class:active={selectedTrack?.id === track.id ||
            (!selectedTrack && activeTrack?.id === track.id)}
          class:shape-track={track.kind === 'shape'}
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
          <span class="track-label">
            <span class="track-name">{track.targetName}</span>
            <button
              type="button"
              class="track-key-action"
              aria-label={`Key ${track.targetName}`}
              title={`Key ${track.targetName}`}
              onpointerdown={(event) => event.stopPropagation()}
              onclick={(event) => {
                event.stopPropagation();
                keyTrack(track);
              }}
            >+</button>
          </span>
          <span class="track-lane">
            {#each track.keyframes as key (key.frame)}
              <button
                type="button"
                class="track-key"
                class:selected={selectedKey?.trackId === track.id &&
                  selectedKey.frame === key.frame}
                class:dragging={keyDrag?.track.id === track.id &&
                  keyDrag.from === key.frame}
                style:left={`${percent(
                  keyDrag?.track.id === track.id && keyDrag.from === key.frame
                    ? keyDrag.to
                    : key.frame
                )}%`}
                aria-label={`Frame ${key.frame}`}
                title={`Frame ${key.frame} · ${key.interpolation}`}
                onpointerdown={(event) => beginKeyDrag(event, track, key.frame)}
                onpointermove={moveKeyDrag}
                onpointerup={endKeyDrag}
                onpointercancel={cancelKeyDrag}
                onkeydown={(event) => {
                  if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault();
                    event.stopPropagation();
                    session.deleteAnimationKeyAt(track, key.frame);
                    selectedKey = null;
                  }
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
    bottom: calc(38px + env(safe-area-inset-bottom));
    left: 12px;
    z-index: 30;
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
    margin: 2px 4px 3px 132px;
    border-bottom: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 9px;
  }

  .timeline-ruler-lane {
    position: relative;
    height: 100%;
  }

  .timeline-ruler-lane span {
    position: absolute;
    bottom: 2px;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .timeline-ruler-lane span:first-child {
    transform: none;
  }

  .timeline-ruler-lane span:last-child {
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

  .timeline-track.shape-track .track-name {
    color: var(--accent-primary);
  }

  .timeline-lane-overlay {
    position: absolute;
    top: 0;
    right: 4px;
    bottom: 0;
    left: 132px;
    pointer-events: none;
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

  .track-label {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }

  .track-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-key-action {
    position: relative;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    padding: 0;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: 1;
    cursor: pointer;
  }

  .track-key-action::before {
    content: '';
    position: absolute;
    inset: -4px;
  }

  .track-key-action:hover {
    border-color: var(--border-strong);
    color: var(--accent-primary);
  }

  .track-key-action:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
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
    touch-action: none;
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

  .track-key::after {
    content: '';
    position: absolute;
    inset: -7px;
  }

  .track-key.selected {
    background: var(--accent-primary);
  }

  .track-key.dragging {
    cursor: grabbing;
    transform: rotate(45deg) scale(1.35);
  }

  :global(:root[data-density='touch']) .track-key {
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
  }

  :global(:root[data-density='touch']) .track-key::after {
    inset: -13px;
  }

  :global(:root[data-density='touch']) .track-key-action {
    width: var(--hit-min);
    height: var(--hit-min);
  }
</style>
