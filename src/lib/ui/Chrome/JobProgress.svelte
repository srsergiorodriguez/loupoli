<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';

  /** Global progress and cancellation for long export and bake jobs. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  const job = $derived(session.snapshot.job);
  const percent = $derived(
    job && job.total > 0
      ? Math.min(100, Math.max(0, Math.round((job.current / job.total) * 100)))
      : 0
  );
</script>

{#if job}
  <aside class="job-strip" aria-label="Active operation">
    <div class="job-head">
      <span class="job-dot" aria-hidden="true"></span>
      <span class="job-label">{job.label}</span>
      <span class="job-detail">{job.detail}</span>
      <span class="job-count">{job.current} / {job.total} · {percent}%</span>
    </div>
    <div class="job-row">
      <div
        class="job-track"
        role="progressbar"
        aria-label={job.label}
        aria-valuemin="0"
        aria-valuemax={job.total}
        aria-valuenow={job.current}
      >
        <div class="job-fill" style:width={`${percent}%`}></div>
      </div>
      <ActionButton
        label={session.snapshot.jobCancelling ? 'Cancelling…' : 'Cancel'}
        variant="danger"
        disabled={session.snapshot.jobCancelling}
        onActivate={() => session.cancelActiveJob()}
      />
    </div>
  </aside>
{/if}

<style>
  .job-strip {
    position: fixed;
    z-index: var(--z-panel);
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-2));
    left: 50%;
    display: flex;
    flex-direction: column;
    width: min(440px, calc(100vw - 24px));
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    gap: var(--space-1);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-panel);
    box-shadow: var(--shadow-panel);
    -webkit-backdrop-filter: blur(var(--blur-panel));
    backdrop-filter: blur(var(--blur-panel));
    transform: translateX(-50%);
    pointer-events: auto;
  }

  .job-head {
    display: flex;
    align-items: baseline;
    min-width: 0;
    gap: var(--space-2);
  }

  .job-dot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-primary);
    box-shadow: 0 0 6px color-mix(in srgb, var(--accent-primary) 55%, transparent);
  }

  .job-label {
    overflow: hidden;
    flex: 1 1 auto;
    color: var(--text-primary);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .job-detail,
  .job-count {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }

  .job-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .job-track {
    flex: 1 1 auto;
    height: 4px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--bg-input);
  }

  .job-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--accent-primary);
    transition: width var(--motion-instant) linear;
  }

  @media (pointer: coarse) {
    .job-strip {
      top: calc(var(--safe-top) + var(--topbar-h) + var(--space-1));
      width: calc(100vw - 16px);
    }
  }
</style>
