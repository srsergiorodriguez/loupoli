/** Tauri-backed native MP4 encoding helpers. */

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let availability: Promise<boolean> | null = null;

/** Whether the platform backend can encode MP4 through AVFoundation. */
export function nativeMp4Available(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return Promise.resolve(false);
  }
  availability ??= import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke<boolean>('mp4_available'))
    .catch(() => false);
  return availability;
}

/** Pick a native output path for a streamed MP4. */
export async function chooseNativeMp4Path(
  suggestedName: string
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const [{ save }] = await Promise.all([import('@tauri-apps/plugin-dialog')]);
  const path = await save({
    defaultPath: suggestedName,
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
  });
  return typeof path === 'string' ? path : null;
}

/** Start an AVFoundation MP4 session. */
export async function beginNativeMp4(
  path: string,
  width: number,
  height: number,
  fps: number
): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('mp4_begin', { path, width, height, fps });
}

/** Append one JPEG/PNG frame without JSON/base64 overhead. */
export async function appendNativeMp4(
  session: string,
  frame: Uint8Array
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('mp4_append', frame, {
    headers: { 'x-mp4-session': session }
  });
}

/** Finalize a native MP4 session. */
export async function finishNativeMp4(session: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('mp4_finish', { session });
}

/** Abort a native MP4 session after an error. */
export async function cancelNativeMp4(session: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('mp4_cancel', { session });
}
