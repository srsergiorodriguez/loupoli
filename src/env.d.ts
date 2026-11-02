import type { EditorRuntime } from './lib/editor/EditorRuntime';
import type { EditorSession } from './lib/editor/EditorSession.svelte';

declare global {
  interface Window {
    /** Development-only handle for interaction/render diagnostics. */
    __LOUPOLI_DEBUG__?: {
      runtime: EditorRuntime;
      session: EditorSession;
    };
  }
}

export {};
