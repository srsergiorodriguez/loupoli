/** Bytes and suggested name returned by the native or browser open flow. */
export interface OpenedProjectFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function safeName(name: string): string {
  const trimmed = name.trim() || 'Untitled';
  return trimmed.toLowerCase().endsWith('.lpoly') ? trimmed : `${trimmed}.lpoly`;
}

/**
 * Open a `.lpoly` project through the Tauri dialog or a browser file picker.
 * Returns null when the user cancels.
 */
export async function openProjectFile(): Promise<OpenedProjectFile | null> {
  if (isTauriRuntime()) {
    const [{ open }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core')
    ]);
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'loupoli project', extensions: ['lpoly'] }]
    });
    if (typeof path !== 'string') {
      return null;
    }
    const bytes = await invoke<number[]>('read_project_file', { path });
    if (!Array.isArray(bytes)) {
      throw new Error('The native reader returned an invalid project payload.');
    }
    const name = path.split(/[\\/]/).pop() ?? 'Untitled.lpoly';
    return { name, bytes: Uint8Array.from(bytes) };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lpoly,application/octet-stream';
    input.hidden = true;
    document.body.appendChild(input);

    let settled = false;
    let focusTimer = 0;
    const finish = (value: OpenedProjectFile | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(focusTimer);
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
      resolve(value);
    };

    // `cancel` is not implemented by every WebView. If the window regains
    // focus and no file has landed shortly afterward, treat it as a cancel.
    const onWindowFocus = (): void => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        if (!settled && (input.files?.length ?? 0) === 0) {
          finish(null);
        }
      }, 600);
    };
    window.addEventListener('focus', onWindowFocus);

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      file
        .arrayBuffer()
        .then((buffer) => finish({ name: file.name, bytes: new Uint8Array(buffer) }))
        .catch(reject);
    });
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/**
 * Save `.lpoly` bytes through the Tauri save dialog or a browser download.
 * Returns false when the user cancels.
 */
export async function saveProjectFile(
  bytes: Uint8Array,
  suggestedName = 'Untitled.lpoly'
): Promise<boolean> {
  const name = safeName(suggestedName);
  if (isTauriRuntime()) {
    const [{ save }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core')
    ]);
    const path = await save({
      defaultPath: name,
      filters: [{ name: 'loupoli project', extensions: ['lpoly'] }]
    });
    if (!path) {
      return false;
    }
    await invoke('write_project_file', {
      path,
      data: Array.from(bytes)
    });
    return true;
  }

  const blob = new Blob([bytes.slice().buffer], {
    type: 'application/octet-stream'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
