<script lang="ts">
  import IconButton from '../Primitives/IconButton.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionMenu from '../Primitives/ActionMenu.svelte';
  import SelectField from '../Primitives/SelectField.svelte';
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
  let zoomStart = $state<number | null>(null);
  let zoomEnd = $state<number | null>(null);

  const snapshot = $derived(session.snapshot);
  const animationClips = $derived(snapshot.animationClips);
  const activeClip = $derived(
    animationClips.find((clip) => clip.id === snapshot.animationClipId) ??
      animationClips[0] ??
      null
  );
  const start = $derived(snapshot.animationStartFrame);
  const end = $derived(Math.max(start + 1, snapshot.animationEndFrame));
  const span = $derived(Math.max(1, end - start));
  const viewStart = $derived(
    zoomStart === null
      ? start
      : Math.max(start, Math.min(end - 2, Math.round(zoomStart)))
  );
  const viewEnd = $derived(
    zoomEnd === null
      ? end
      : Math.max(viewStart + 1, Math.min(end, Math.round(zoomEnd)))
  );
  const viewSpan = $derived(Math.max(1, viewEnd - viewStart));
  const tickStep = $derived(niceStep(viewSpan, 8));
  const ticks = $derived.by(() => {
    const result: { frame: number; label: string; major: boolean }[] = [];
    const minor = Math.max(1, Math.floor(tickStep / 5));
    const first = Math.ceil(viewStart / minor) * minor;
    for (let frame = first; frame <= viewEnd; frame += minor) {
      const major = frame % tickStep === 0;
      result.push({
        frame,
        label: major ? String(frame) : '',
        major
      });
    }
    return result;
  });
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

  function niceStep(spanFrames: number, targetTicks: number): number {
    const raw = Math.max(1, spanFrames / Math.max(1, targetTicks));
    const power = 10 ** Math.floor(Math.log10(raw));
    const unit = raw / power;
    const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
    return Math.max(1, Math.round(nice * power));
  }

  function percent(frame: number): number {
    return Math.max(
      0,
      Math.min(100, ((frame - viewStart) / viewSpan) * 100)
    );
  }

  function zoomTo(nextStart: number, nextEnd: number): void {
    const minimum = Math.min(4, span);
    const nextSpan = Math.max(minimum, Math.min(span, Math.round(nextEnd - nextStart)));
    const center = (nextStart + nextEnd) / 2;
    let clampedStart = Math.round(center - nextSpan / 2);
    clampedStart = Math.max(start, Math.min(end - nextSpan, clampedStart));
    zoomStart = clampedStart;
    zoomEnd = clampedStart + nextSpan;
  }

  function zoomBy(factor: number): void {
    const current = Math.round(snapshot.animationFrame);
    const center =
      current >= viewStart && current <= viewEnd
        ? current
        : (viewStart + viewEnd) / 2;
    const nextSpan = Math.max(
      Math.min(4, span),
      Math.min(span, viewSpan * factor)
    );
    zoomTo(center - nextSpan / 2, center + nextSpan / 2);
  }

  function fitTimeline(): void {
    zoomStart = null;
    zoomEnd = null;
  }

  function panBy(frames: number): void {
    if (viewSpan >= span) {
      return;
    }
    const nextStart = Math.max(
      start,
      Math.min(end - viewSpan, viewStart + Math.round(frames))
    );
    zoomStart = nextStart;
    zoomEnd = nextStart + viewSpan;
  }

  function wheelTimeline(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? 1.25 : 0.8);
      return;
    }
    if (viewSpan < span) {
      event.preventDefault();
      panBy(event.deltaY > 0 ? viewSpan * 0.12 : -viewSpan * 0.12);
    }
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
    return Math.round(viewStart + ratio * viewSpan);
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
    drag.to = Math.round(viewStart + ratio * viewSpan);
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

<section class="animation-timeline loupoli-panel" aria-label="Animation timeline" onwheel={wheelTimeline}>
  <div class="timeline-clipbar">
    <SelectField
      label="Clip"
      value={snapshot.animationClipId}
      options={animationClips.map((clip) => ({
        value: clip.id,
        label: clip.name
      }))}
      onChange={(value) => session.setActiveAnimationClip(value)}
    />
    <ActionMenu
      label="Clip actions"
      icon="more"
      menuTitle="Animation clips"
      options={[
        {
          label: 'New clip',
          icon: 'plus',
          onSelect: () => session.addAnimationClip()
        },
        {
          label: 'Duplicate clip',
          icon: 'copy',
          onSelect: () => session.duplicateAnimationClip()
        },
        {
          label: 'Delete clip',
          icon: 'trash',
          destructive: true,
          separatorBefore: true,
          disabled: animationClips.length <= 1,
          onSelect: () => session.deleteAnimationClip()
        }
      ]}
    />
    {#if activeClip}
      <span class="timeline-clip-meta">
        {activeClip.trackCount} track{activeClip.trackCount === 1 ? '' : 's'}
      </span>
    {/if}
  </div>

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
    <div class="timeline-zoom">
      <IconButton
        label="Zoom out timeline"
        icon="minus"
        tooltip="Zoom out"
        disabled={viewSpan >= span}
        onActivate={() => zoomBy(1.5)}
      />
      <IconButton
        label="Fit timeline"
        icon="frame"
        tooltip="Fit timeline"
        disabled={viewSpan >= span}
        onActivate={fitTimeline}
      />
      <IconButton
        label="Zoom in timeline"
        icon="plus"
        tooltip="Zoom in"
        disabled={viewSpan <= Math.min(4, span)}
        onActivate={() => zoomBy(0.67)}
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

  {#if selectedKeyData}
    <div class="timeline-key-editor">
      <SelectField
        label="Key interpolation"
        value={selectedKeyData.key.interpolation}
        options={[
          { value: 'linear', label: 'Linear' },
          { value: 'step', label: 'Step' }
        ]}
        onChange={(value) =>
          session.setAnimationKeyInterpolation(
            selectedKeyData.track,
            selectedKeyData.key.frame,
            value as 'linear' | 'step'
          )}
      />
    </div>
  {/if}

  <div class="timeline-ruler" aria-hidden="true">
    <div class="timeline-ruler-lane">
      {#each ticks as tick (tick.frame)}
        <span
          class="timeline-tick"
          class:major={tick.major}
          style:left={`${percent(tick.frame)}%`}
        >{tick.label}</span>
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
    {#if snapshot.animationFrame >= viewStart && snapshot.animationFrame <= viewEnd}
      <span class="timeline-lane-overlay" aria-hidden="true">
        <span
          class="timeline-playhead"
          style:left={`${percent(snapshot.animationFrame)}%`}
        ></span>
      </span>
    {/if}
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
            {#each track.keyframes.filter((key) => key.frame >= viewStart && key.frame <= viewEnd) as key (key.frame)}
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

  .timeline-clipbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0 4px var(--space-1) 132px;
  }

  .timeline-clipbar :global(.select-field) {
    grid-template-columns: auto minmax(120px, 220px);
    justify-content: start;
    min-width: 0;
  }

  .timeline-clip-meta {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
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

  .timeline-zoom {
    display: flex;
    align-items: center;
    gap: 1px;
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

  .timeline-key-editor {
    margin: 2px 4px 0 132px;
  }

  .timeline-key-editor :global(.select-field) {
    grid-template-columns: auto minmax(90px, 140px);
    justify-content: start;
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

  .timeline-ruler-lane span::after {
    content: '';
    position: absolute;
    right: 50%;
    bottom: -4px;
    width: 1px;
    height: 3px;
    background: var(--border-strong);
  }

  .timeline-ruler-lane span.major::after {
    height: 5px;
    background: var(--text-tertiary);
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
