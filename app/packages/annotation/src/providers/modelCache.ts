const DB_NAME = "fiftyone-models";
const STORE_NAME = "weights";
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1000;

/** Open (or create) the IndexedDB database for model weight caching. */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Read a cached ArrayBuffer by key, or undefined on miss. */
function idbGet(db: IDBDatabase, key: string): Promise<ArrayBuffer | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);

    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Write an ArrayBuffer to the cache, keyed by URL. */
function idbPut(db: IDBDatabase, key: string, value: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");

    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Fetch a URL with up to MAX_RETRIES retry attempts and stream progress.
 * Retries on network errors and 5xx; throws immediately on 4xx.
 * Uses ReadableStream to report incremental progress when content-length is available.
 */
async function fetchWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0)
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt));

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }

    if (!response.ok) {
      lastError = new Error(`${response.status} ${response.statusText} (${url})`);
      // Don't retry 4xx
      if (response.status >= 400 && response.status < 500)
        throw lastError;
      continue;
    }

    try {
      const total = Number(response.headers.get("content-length")) || 0;

      // Fast path: skip streaming if no progress callback or ReadableStream unavailable
      if (!onProgress || !response.body)
        return await response.arrayBuffer();

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done)
          break;

        chunks.push(value);
        loaded += value.byteLength;
        onProgress(loaded, total);
      }

      const result = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return result.buffer;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError;
}

/**
 * Load a model weights file, using IndexedDB cache if available.
 * Downloads with progress and retries on cache-misses, then caches the result.
 * Falls back to download-only if IndexedDB is unavailable.
 *
 * @param url URL of the model weights file
 * @param onProgress Called with (loaded, total) bytes during download or immediately on cache hit
 * @param onWarning Called when a non-fatal issue occurs (e.g. IndexedDB unavailable)
 */
export async function loadModelWeights(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
  onWarning?: (message: string) => void
): Promise<ArrayBuffer> {
  let db: IDBDatabase | null = null;

  try {
    db = await openDB();
    const cached = await idbGet(db, url);
    if (cached) {
      db.close();
      onProgress?.(cached.byteLength, cached.byteLength);
      return cached;
    }
  } catch (err) {
    onWarning?.(`IndexedDB cache read failed, downloading instead: ${err}`);
  }

  const buffer = await fetchWithProgress(url, onProgress);

  if (db) {
    try {
      await idbPut(db, url, buffer);
    } catch (err) {
      onWarning?.(`IndexedDB cache write failed: ${err}`);
    }
    db.close();
  }

  return buffer;
}
