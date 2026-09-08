import type { ImageGeometry } from "./math";

const DB_NAME = "fiftyone-embeddings";
const STORE_NAME = "embeddings";
const META_STORE = "metadata";
export const MAX_CACHE_ENTRIES = 5;

interface StoredTensor {
  data: Float32Array;
  dims: number[];
}

export interface CachedEmbedding {
  imageEmbed: StoredTensor;
  highResFeats0: StoredTensor;
  highResFeats1: StoredTensor;
  processedImage: ImageGeometry;
}

/**
 * In-memory LRU. Map iteration order = insertion order; newest at end.
 * Each entry holds three Float32Array tensors (encoder outputs); size depends on the model.
 */
const cache = new Map<string, CachedEmbedding>();

/** Reset in-memory cache. Exported for testing only. */
export function _resetMemoryCache(): void {
  cache.clear();
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
      req.result.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Read a cached embedding by key, or undefined on miss. */
function idbGet(
  db: IDBDatabase,
  key: string,
): Promise<CachedEmbedding | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");

    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as CachedEmbedding | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Write an embedding to the cache, keyed by URL. */
function idbPut(
  db: IDBDatabase,
  key: string,
  value: CachedEmbedding,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");

    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete a single cache entry by key. */
function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Return all keys in the object store. */
function idbGetAllKeys(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    // Keys are always URL strings
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

/** Write a lightweight timestamp to the metadata store. */
function idbPutMeta(
  db: IDBDatabase,
  key: string,
  lastAccessed: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(lastAccessed, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Read a timestamp from the metadata store. */
function idbGetMeta(db: IDBDatabase, key: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(key);
    req.onsuccess = () => resolve(req.result as number | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Delete a metadata entry by key. */
function idbDeleteMeta(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Move a key to the end of the Map (= most recently used). */
function touch(key: string, value: CachedEmbedding): void {
  cache.delete(key);
  cache.set(key, value);
}

/** Evict oldest entries from memory when over limit. */
function evictMemory(): void {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const [oldest] = cache.keys();
    cache.delete(oldest);
  }
}

/**
 * Evict oldest IDB entries by lastAccessed timestamp when over limit.
 * Read failures treat entries as oldest (lastAccessed=0), which may
 * cause premature eviction. This is Acceptable since cache is an
 * optimization, not a source of truth. */
async function evictIDB(db: IDBDatabase): Promise<void> {
  const keys = await idbGetAllKeys(db);
  if (keys.length <= MAX_CACHE_ENTRIES) return;

  // Read timestamps from lightweight metadata store
  const entries: { key: string; lastAccessed: number }[] = [];
  for (const key of keys) {
    const ts = await idbGetMeta(db, key).catch((): undefined => undefined);
    entries.push({ key, lastAccessed: ts ?? 0 });
  }

  // Sort oldest first, delete excess from both stores
  entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
  const toDelete = entries.length - MAX_CACHE_ENTRIES;
  for (let i = 0; i < toDelete; i++) {
    await idbDelete(db, entries[i].key).catch(() => {});
    await idbDeleteMeta(db, entries[i].key).catch(() => {});
  }
}

/**
 * Get a cached embedding by image URL.
 * Checks in-memory LRU first, falls back to IndexedDB.
 */
export async function getEmbedding(
  url: string,
  onWarning?: (message: string) => void,
): Promise<CachedEmbedding | undefined> {
  const mem = cache.get(url);
  if (mem) {
    touch(url, mem);

    // Persist updated timestamp to lightweight metadata store (fire-and-forget)
    openDB()
      .then((db) => idbPutMeta(db, url, Date.now()).finally(() => db.close()))
      .catch((err) =>
        onWarning?.(`Embedding cache timestamp update failed: ${err}`),
      );

    return mem;
  }

  let db: IDBDatabase;
  try {
    db = await openDB();
  } catch (err) {
    onWarning?.(`Embedding cache open failed: ${err}`);
    return undefined;
  }

  try {
    const record = await idbGet(db, url);
    if (!record) return undefined;

    touch(url, record);
    evictMemory();

    // Update timestamp in lightweight metadata store (fire-and-forget: close() waits for pending txn)
    idbPutMeta(db, url, Date.now()).catch((err) =>
      onWarning?.(`Embedding cache timestamp update failed: ${err}`),
    );

    return record;
  } catch (err) {
    onWarning?.(`Embedding cache read failed: ${err}`);
    return undefined;
  } finally {
    db.close();
  }
}

/**
 * Store an embedding in the cache, evicting the LRU entry if over limit.
 * Memory updates are synchronous; IDB write is async (safe to fire-and-forget).
 */
export async function putEmbedding(
  url: string,
  embedding: CachedEmbedding,
  onWarning?: (message: string) => void,
): Promise<void> {
  touch(url, embedding);
  evictMemory();

  let db: IDBDatabase;
  try {
    db = await openDB();
  } catch (err) {
    onWarning?.(`Embedding cache open failed: ${err}`);
    return;
  }

  try {
    await idbPut(db, url, embedding);
    await idbPutMeta(db, url, Date.now());
    await evictIDB(db);
  } catch (err) {
    onWarning?.(`Embedding cache write failed: ${err}`);
  } finally {
    db.close();
  }
}
