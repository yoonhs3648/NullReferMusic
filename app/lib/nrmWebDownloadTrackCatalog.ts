import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';

const DB_NAME = 'nrm-web-downloads';
const DB_VERSION = 1;
const STORE = 'tracks';

export type WebTrackRecord = {
  id: string;
  fileName: string;
  extension: string;
  displayLabel: string;
  metadata: NrmAudioFileMetadata;
  lrcText?: string;
  createdAt: number;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb_open_failed'));
  });
}

function txStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error ?? new Error('indexeddb_tx_failed'));
        resolve(store);
      }),
  );
}

export function webTrackUri(trackId: string): string {
  return `nrm-web-track:${trackId}`;
}

export async function upsertWebTrack(record: WebTrackRecord, audioBlob: Blob): Promise<void> {
  const store = await txStore('readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.put({ ...record, audioBlob });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('indexeddb_put_failed'));
  });
}

export async function listWebTracks(): Promise<WebTrackRecord[]> {
  const store = await txStore('readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as Array<WebTrackRecord & { audioBlob?: Blob }>) ?? [];
      resolve(
        rows
          .map(({ audioBlob: _b, ...rest }) => rest)
          .sort((a, b) => a.fileName.localeCompare(b.fileName, 'ko')),
      );
    };
    req.onerror = () => reject(req.error ?? new Error('indexeddb_get_all_failed'));
  });
}

export async function readWebTrackBlob(uri: string): Promise<Blob | null> {
  const id = uri.replace(/^nrm-web-track:/, '');
  if (!id) return null;
  const store = await txStore('readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result as (WebTrackRecord & { audioBlob?: Blob }) | undefined;
      resolve(row?.audioBlob ?? null);
    };
    req.onerror = () => reject(req.error ?? new Error('indexeddb_get_failed'));
  });
}

export async function readWebTrackRecord(uri: string): Promise<WebTrackRecord | null> {
  const id = uri.replace(/^nrm-web-track:/, '');
  if (!id) return null;
  const store = await txStore('readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result as (WebTrackRecord & { audioBlob?: Blob }) | undefined;
      if (!row) {
        resolve(null);
        return;
      }
      const { audioBlob: _b, ...rest } = row;
      resolve(rest);
    };
    req.onerror = () => reject(req.error ?? new Error('indexeddb_get_failed'));
  });
}

export async function deleteWebTrack(uri: string): Promise<void> {
  const id = uri.replace(/^nrm-web-track:/, '');
  if (!id) return;
  const store = await txStore('readwrite');
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('indexeddb_delete_failed'));
  });
}

export function webTrackToListItem(record: WebTrackRecord): NrmDownloadTrackItem {
  const lrcUri = record.lrcText?.trim()
    ? webTrackUri(`${record.id}:lrc`)
    : undefined;
  return {
    fileName: record.fileName,
    audioUri: webTrackUri(record.id),
    extension: record.extension,
    location: {
      kind: 'web',
      trackId: record.id,
      audioUri: webTrackUri(record.id),
      fileName: record.fileName,
    },
    lrcUri,
    displayLabel: record.displayLabel,
  };
}

export async function registerWebDownloadTrack(options: {
  fileName: string;
  extension: string;
  displayLabel: string;
  metadata: NrmAudioFileMetadata;
  audioBlob: Blob;
  lrcText?: string;
}): Promise<NrmDownloadTrackItem> {
  const id = `wt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();
  const record: WebTrackRecord = {
    id,
    fileName: options.fileName,
    extension: options.extension,
    displayLabel: options.displayLabel,
    metadata: options.metadata,
    lrcText: options.lrcText,
    createdAt: now,
    updatedAt: now,
  };
  await upsertWebTrack(record, options.audioBlob);
  return webTrackToListItem(record);
}

export async function updateWebTrackMetadata(
  trackId: string,
  patch: Partial<Pick<WebTrackRecord, 'fileName' | 'displayLabel' | 'metadata' | 'lrcText'>>,
  audioBlob?: Blob,
): Promise<void> {
  const store = await txStore('readwrite');
  await new Promise<void>((resolve, reject) => {
    const getReq = store.get(trackId);
    getReq.onsuccess = () => {
      const row = getReq.result as (WebTrackRecord & { audioBlob?: Blob }) | undefined;
      if (!row) {
        reject(new Error('web_track_not_found'));
        return;
      }
      const next = {
        ...row,
        ...patch,
        updatedAt: Date.now(),
        audioBlob: audioBlob ?? row.audioBlob,
      };
      const putReq = store.put(next);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error('indexeddb_put_failed'));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error('indexeddb_get_failed'));
  });
}

export async function readWebTrackLrcText(uri: string): Promise<string | null> {
  if (!uri.endsWith(':lrc')) return null;
  const baseId = uri.replace(/^nrm-web-track:/, '').replace(/:lrc$/, '');
  const store = await txStore('readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(baseId);
    req.onsuccess = () => {
      const row = req.result as WebTrackRecord | undefined;
      resolve(row?.lrcText?.trim() ? row.lrcText : null);
    };
    req.onerror = () => reject(req.error ?? new Error('indexeddb_get_failed'));
  });
}
