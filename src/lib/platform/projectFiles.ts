/** Bytes and suggested name returned by the native or browser open flow. */
export interface OpenedProjectFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** Primary extension for new loupoli project files. */
export const PROJECT_EXTENSION = 'lpoli';

/** Legacy extension accepted for files created before the rename. */
export const LEGACY_PROJECT_EXTENSION = 'lpoly';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Whether project files use the native save/open dialogs instead of downloads. */
export function hasNativeProjectFiles(): boolean {
  return isTauriRuntime();
}

/** Normalize a project name to the primary `.lpoli` extension. */
export function projectFileName(name: string): string {
  const trimmed = name.trim() || 'Untitled';
  const withoutExtension = trimmed.replace(/\.(lpoli|lpoly)$/i, '');
  return `${withoutExtension}.${PROJECT_EXTENSION}`;
}

/**
 * Open a `.lpoli` project through the Tauri dialog or a browser file picker.
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
      filters: [
        {
          name: 'loupoli project',
          extensions: [PROJECT_EXTENSION, LEGACY_PROJECT_EXTENSION]
        }
      ]
    });
    if (typeof path !== 'string') {
      return null;
    }
    const bytes = await invoke<number[]>('read_project_file', { path });
    if (!Array.isArray(bytes)) {
      throw new Error('The native reader returned an invalid project payload.');
    }
    const name = path.split(/[\\/]/).pop() ?? 'Untitled.lpoli';
    return { name, bytes: Uint8Array.from(bytes) };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lpoli,.lpoly,application/octet-stream';
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

function zipCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

/** Build a dependency-free ZIP archive with stored (uncompressed) PNG entries. */
function buildZip(files: readonly { name: string; bytes: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const entries = files.map((file) => ({
    ...file,
    nameBytes: encoder.encode(file.name),
    crc: zipCrc32(file.bytes)
  }));
  let size = 0;
  for (const entry of entries) {
    size += 30 + entry.nameBytes.length + entry.bytes.length;
    size += 46 + entry.nameBytes.length;
  }
  size += 22;
  const zip = new Uint8Array(size);
  let offset = 0;
  const central: { offset: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const localOffset = offset;
    writeU32(zip, offset, 0x04034b50);
    writeU16(zip, offset + 4, 20);
    writeU16(zip, offset + 6, 0);
    writeU16(zip, offset + 8, 0);
    writeU16(zip, offset + 10, 0);
    writeU16(zip, offset + 12, 0);
    writeU32(zip, offset + 14, entry.crc);
    writeU32(zip, offset + 18, entry.bytes.length);
    writeU32(zip, offset + 22, entry.bytes.length);
    writeU16(zip, offset + 26, entry.nameBytes.length);
    writeU16(zip, offset + 28, 0);
    zip.set(entry.nameBytes, offset + 30);
    offset += 30 + entry.nameBytes.length;
    zip.set(entry.bytes, offset);
    offset += entry.bytes.length;
    central.push({ offset: localOffset, index });
  });
  const centralOffset = offset;
  for (const item of central) {
    const entry = entries[item.index];
    writeU32(zip, offset, 0x02014b50);
    writeU16(zip, offset + 4, 20);
    writeU16(zip, offset + 6, 20);
    writeU16(zip, offset + 8, 0);
    writeU16(zip, offset + 10, 0);
    writeU16(zip, offset + 12, 0);
    writeU16(zip, offset + 14, 0);
    writeU32(zip, offset + 16, entry.crc);
    writeU32(zip, offset + 20, entry.bytes.length);
    writeU32(zip, offset + 24, entry.bytes.length);
    writeU16(zip, offset + 28, entry.nameBytes.length);
    writeU16(zip, offset + 30, 0);
    writeU16(zip, offset + 32, 0);
    writeU16(zip, offset + 34, 0);
    writeU16(zip, offset + 36, 0);
    writeU32(zip, offset + 38, 0);
    writeU32(zip, offset + 42, item.offset);
    zip.set(entry.nameBytes, offset + 46);
    offset += 46 + entry.nameBytes.length;
  }
  writeU32(zip, offset, 0x06054b50);
  writeU16(zip, offset + 4, 0);
  writeU16(zip, offset + 6, 0);
  writeU16(zip, offset + 8, entries.length);
  writeU16(zip, offset + 10, entries.length);
  writeU32(zip, offset + 12, offset - centralOffset);
  writeU32(zip, offset + 16, centralOffset);
  writeU16(zip, offset + 20, 0);
  return zip;
}

/**
 * Open a model/interchange file through the native dialog or browser picker.
 */
export async function openModelFile(
  extensions: readonly string[],
  filterName: string
): Promise<OpenedProjectFile | null> {
  if (isTauriRuntime()) {
    const [{ open }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core')
    ]);
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: filterName, extensions: [...extensions] }]
    });
    if (typeof path !== 'string') {
      return null;
    }
    const bytes = await invoke<number[]>('read_import_file', { path });
    const name = path.split(/[\\/]/).pop() ?? `Imported.${extensions[0]}`;
    return { name, bytes: Uint8Array.from(bytes) };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = extensions.map((extension) => `.${extension}`).join(',');
    input.hidden = true;
    document.body.appendChild(input);
    let settled = false;
    const finish = (value: OpenedProjectFile | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      file
        .arrayBuffer()
        .then((buffer) =>
          finish({ name: file.name, bytes: new Uint8Array(buffer) })
        )
        .catch(reject);
    });
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/**
 * Save a PNG frame sequence as a folder (native) or a ZIP (browser).
 */
export async function saveFrameSequence(
  frames: readonly { name: string; bytes: Uint8Array }[],
  zipName: string
): Promise<boolean> {
  if (isTauriRuntime()) {
    const [{ open }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core')
    ]);
    const directory = await open({ directory: true, multiple: false });
    if (typeof directory !== 'string') {
      return false;
    }
    for (const frame of frames) {
      await invoke('write_export_file', {
        path: `${directory}/${frame.name}`,
        data: Array.from(frame.bytes)
      });
    }
    return true;
  }
  return saveBinaryFile(buildZip(frames), zipName, 'zip', 'ZIP archive');
}

/**
 * Save arbitrary bytes through a native save dialog or a browser download.
 */
export async function saveBinaryFile(
  bytes: Uint8Array,
  suggestedName: string,
  extension: string,
  filterName: string
): Promise<boolean> {
  const name = suggestedName.toLowerCase().endsWith(`.${extension}`)
    ? suggestedName
    : `${suggestedName}.${extension}`;
  if (isTauriRuntime()) {
    const [{ save }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core')
    ]);
    const path = await save({
      defaultPath: name,
      filters: [{ name: filterName, extensions: [extension] }]
    });
    if (!path) {
      return false;
    }
    await invoke('write_export_file', { path, data: Array.from(bytes) });
    return true;
  }
  const blob = new Blob([bytes.slice().buffer], { type: 'application/octet-stream' });
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

/**
 * Save `.lpoli` bytes through the Tauri save dialog or a browser download.
 * Returns false when the user cancels.
 */
export async function saveProjectFile(
  bytes: Uint8Array,
  suggestedName = 'Untitled.lpoli'
): Promise<boolean> {
  const name = projectFileName(suggestedName);
  if (isTauriRuntime()) {
    const [{ save }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core')
    ]);
    const path = await save({
      defaultPath: name,
      filters: [{ name: 'loupoli project', extensions: [PROJECT_EXTENSION] }]
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
