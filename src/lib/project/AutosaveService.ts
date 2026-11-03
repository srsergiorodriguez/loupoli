import type { JournalPatch } from './journal';
import { journalPatchBytes } from './journal';
import type { ProjectSettings } from './lpoly';

const DB_NAME = 'loupoli-autosave';
const STORE_NAME = 'state';
const RECORD_KEY = 'current';
const RECORD_VERSION = 1;
const AUTOSAVE_INTERVAL_MS = 30_000;
const MAX_DELTA_COUNT = 512;
const MAX_DELTA_BYTES = 4 * 1024 * 1024;

/** Autosave lifecycle states exposed to the UI. */
export type AutosaveStatus =
  | 'unavailable'
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error';

/** Current autosave health and last successful persistence time. */
export interface AutosaveState {
  readonly status: AutosaveStatus;
  readonly lastSavedAt: number | null;
  readonly error: string | null;
}

/** Recoverable checkpoint plus the transitions applied after it. */
export interface RecoveryRecord {
  readonly checkpoint: Uint8Array;
  readonly settings: ProjectSettings;
  readonly deltas: readonly JournalPatch[];
  readonly updatedAt: number;
}

interface StoredRecord {
  readonly version: number;
  readonly checkpoint: Uint8Array;
  readonly settings: ProjectSettings;
  readonly deltas: JournalPatch[];
  readonly updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open the autosave database.'));
  });
}

function readRecord(db: IDBDatabase): Promise<StoredRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess = () => {
      const value = request.result as StoredRecord | undefined;
      if (!value) {
        resolve(null);
        return;
      }
      if (
        value.version !== RECORD_VERSION ||
        !(value.checkpoint instanceof Uint8Array) ||
        !Array.isArray(value.deltas) ||
        typeof value.updatedAt !== 'number'
      ) {
        reject(new Error('The autosave record has an unsupported structure.'));
        return;
      }
      resolve(value);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to read the autosave record.'));
  });
}

function writeRecord(db: IDBDatabase, record: StoredRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Unable to write the autosave record.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('The autosave transaction was aborted.'));
  });
}

function deleteRecord(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Unable to clear the autosave record.'));
  });
}

/**
 * Crash-safe autosave journal: a checkpoint plus localized document deltas.
 *
 * The in-memory checkpoint is captured once when a session starts. Deltas are
 * flushed at most every 30 seconds while dirty and on visibility loss. When the
 * journal grows past its budget, a fresh checkpoint replaces it. No operation
 * appends full scene snapshots per edit.
 */
export class AutosaveService {
  private db: IDBDatabase | null = null;
  private enabled = false;
  private checkpoint: Uint8Array | null = null;
  private settings: ProjectSettings | null = null;
  private deltas: JournalPatch[] = [];
  private deltaBytes = 0;
  private dirty = false;
  private textureDirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: AutosaveState = {
    status: 'unavailable',
    lastSavedAt: null,
    error: null
  };
  private readonly onStateChange: (state: AutosaveState) => void;
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      void this.flush();
    }
  };
  private readonly onPageHide = (): void => {
    void this.flush();
  };

  constructor(
    private readonly makeCheckpoint: () => Promise<{
      bytes: Uint8Array;
      settings: ProjectSettings;
    }>,
    onStateChange: (state: AutosaveState) => void
  ) {
    this.onStateChange = onStateChange;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** Current status for the UI projection. */
  getState(): AutosaveState {
    return this.state;
  }

  /** Read a previous recovery record without enabling writes. */
  async findRecovery(): Promise<RecoveryRecord | null> {
    try {
      this.db ??= await openDatabase();
      const record = await readRecord(this.db);
      if (!record) {
        return null;
      }
      return {
        checkpoint: record.checkpoint,
        settings: record.settings,
        deltas: record.deltas,
        updatedAt: record.updatedAt
      };
    } catch (error) {
      this.setState('error', error);
      return null;
    }
  }

  /**
   * Begin autosaving. A fresh session keeps its checkpoint in memory until the
   * first dirty flush; a recovered session can persist immediately.
   */
  async start(
    checkpoint: Uint8Array,
    settings: ProjectSettings,
    persistInitial = false
  ): Promise<void> {
    this.checkpoint = checkpoint;
    this.settings = settings;
    this.deltas = [];
    this.deltaBytes = 0;
    this.dirty = false;
    this.textureDirty = false;
    this.enabled = true;
    this.setState(persistInitial ? 'saving' : 'idle', null);

    if (persistInitial) {
      await this.persist();
    }

    if (this.timer === null) {
      this.timer = setInterval(() => {
        void this.flush();
      }, AUTOSAVE_INTERVAL_MS);
    }
  }

  /** Record one document transition. Structural snapshots are localized nodes. */
  record(patch: JournalPatch): void {
    if (!this.enabled) {
      return;
    }
    this.deltas.push(patch);
    this.deltaBytes += journalPatchBytes(patch);
    this.dirty = true;
    this.setState('dirty', null);
  }

  /**
   * Mark texture pixels dirty. The next flush rebuilds a full v2 checkpoint
   * because texture PNG chunks are not represented by geometry deltas.
   */
  markTextureDirty(): void {
    if (!this.enabled) {
      return;
    }
    this.dirty = true;
    this.textureDirty = true;
    this.setState('dirty', null);
  }

  /** Persist the checkpoint and pending deltas. No-op when already clean. */
  async flush(): Promise<void> {
    if (!this.enabled || !this.dirty) {
      return;
    }
    this.setState('saving', null);

    try {
      if (
        this.textureDirty ||
        this.deltas.length > MAX_DELTA_COUNT ||
        this.deltaBytes > MAX_DELTA_BYTES
      ) {
        const fresh = await this.makeCheckpoint();
        this.checkpoint = fresh.bytes;
        this.settings = fresh.settings;
        this.deltas = [];
        this.deltaBytes = 0;
        this.textureDirty = false;
      }
    } catch (error) {
      this.setState('error', error);
      return;
    }

    await this.persist();
  }

  /** Drop the recovery record and stop the active session. */
  async clear(): Promise<void> {
    this.enabled = false;
    this.deltas = [];
    this.deltaBytes = 0;
    this.dirty = false;
    this.textureDirty = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.db ??= await openDatabase();
      await deleteRecord(this.db);
      this.setState('idle', null);
    } catch (error) {
      this.setState('error', error);
    }
  }

  /** Release timers and listeners. The caller flushes before disposal if needed. */
  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    this.db?.close();
    this.db = null;
  }

  private async persist(): Promise<void> {
    if (!this.checkpoint || !this.settings) {
      return;
    }
    try {
      this.db ??= await openDatabase();
      const record: StoredRecord = {
        version: RECORD_VERSION,
        checkpoint: this.checkpoint.slice(),
        settings: this.settings,
        deltas: this.deltas.slice(),
        updatedAt: Date.now()
      };
      await writeRecord(this.db, record);
      this.dirty = false;
      this.setState('saved', null);
    } catch (error) {
      this.setState('error', error);
    }
  }

  private setState(status: AutosaveStatus, error: unknown): void {
    this.state = {
      status,
      lastSavedAt: status === 'saved' ? Date.now() : this.state.lastSavedAt,
      error:
        error instanceof Error
          ? error.message
          : error
            ? String(error)
            : null
    };
    this.onStateChange(this.state);
  }
}
