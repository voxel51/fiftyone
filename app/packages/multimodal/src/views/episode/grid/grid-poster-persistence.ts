import type {
  GridPosterCacheEntry,
  GridPosterCacheKey,
} from "./grid-poster-cache";

const MIB = 1024 * 1024;
const DATABASE_NAME = "fiftyone-multimodal-grid-posters";
const DATABASE_VERSION = 1;
const ENTRY_STORE = "entries";
const RECENCY_STORE = "recency";
const STATE_STORE = "state";
const RECENCY_INDEX = "last-accessed";
const TOTALS_KEY = "totals";
const STORED_ENTRY_VERSION = 1;

const DEFAULT_MAX_ENTRIES = 4_096;
const DEFAULT_MAX_SIZE_BYTES = 256 * MIB;

interface StoredGridPosterEntry extends Omit<GridPosterCacheEntry, "bytes"> {
  readonly bytes: Blob;
  readonly version: typeof STORED_ENTRY_VERSION;
}

interface StoredGridPosterRecency {
  readonly byteLength: number;
  readonly key: GridPosterCacheKey;
  readonly lastAccessedAt: number;
}

interface StoredGridPosterTotals {
  readonly entryCount: number;
  readonly sizeBytes: number;
}

export interface GridPosterPersistence {
  get(key: GridPosterCacheKey): Promise<GridPosterCacheEntry | null>;
  put(key: GridPosterCacheKey, entry: GridPosterCacheEntry): Promise<void>;
}

/**
 * Creates the reload-surviving grid-poster tier. Every operation is
 * best-effort: storage denial, quota pressure, corruption, and unsupported
 * runtimes all degrade to a miss without affecting preview rendering.
 */
function createIndexedDbGridPosterPersistence(): GridPosterPersistence {
  let databasePromise: Promise<IDBDatabase | null> | null = null;
  const pendingReads = new Map<
    GridPosterCacheKey,
    Promise<GridPosterCacheEntry | null>
  >();
  let evictionChain = Promise.resolve();

  const open = () => {
    databasePromise ??= openDatabase();
    return databasePromise;
  };

  const read = async (
    key: GridPosterCacheKey,
  ): Promise<GridPosterCacheEntry | null> => {
    const database = await open();
    if (!database) return null;
    try {
      const stored = await readStoredEntry(database, key);
      const entry = await decodeStoredEntry(stored);
      if (!entry) {
        if (stored) await deleteStoredEntry(database, key);
        return null;
      }
      // Recency is advisory, so it must not delay the visible cache hit.
      void touchStoredEntry(database, key, Date.now());
      return entry;
    } catch {
      return null;
    }
  };

  return {
    get(key) {
      let pending = pendingReads.get(key);
      if (!pending) {
        pending = read(key).finally(() => pendingReads.delete(key));
        pendingReads.set(key, pending);
      }
      return pending;
    },

    async put(key, entry) {
      if (
        !validEntry(entry) ||
        entry.bytes.byteLength > DEFAULT_MAX_SIZE_BYTES
      ) {
        return;
      }
      const database = await open();
      if (!database) return;
      try {
        await writeStoredEntry(database, key, entry, Date.now());
        // Serialize budget enforcement so a burst of poster captures cannot
        // race totals or run several cursor sweeps at once.
        evictionChain = evictionChain
          .catch(() => undefined)
          .then(() =>
            enforceBudget(
              database,
              DEFAULT_MAX_ENTRIES,
              DEFAULT_MAX_SIZE_BYTES,
            ),
          );
        await evictionChain;
      } catch {
        // The memory tier has already accepted the poster. Persistence is an
        // optimization and must never turn a successful render into an error.
      }
    },
  };
}

let singleton: GridPosterPersistence = createIndexedDbGridPosterPersistence();

export function getGridPosterPersistence(): GridPosterPersistence {
  return singleton;
}

export function resetGridPosterPersistenceForTests(
  persistence?: GridPosterPersistence,
): void {
  singleton = persistence ?? createIndexedDbGridPosterPersistence();
}

function openDatabase(): Promise<IDBDatabase | null> {
  const factory = (globalThis as typeof globalThis & { indexedDB?: IDBFactory })
    .indexedDB;
  if (!factory) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (database: IDBDatabase | null) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      finish(null);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ENTRY_STORE)) {
        database.createObjectStore(ENTRY_STORE);
      }
      if (!database.objectStoreNames.contains(RECENCY_STORE)) {
        const store = database.createObjectStore(RECENCY_STORE, {
          keyPath: "key",
        });
        store.createIndex(RECENCY_INDEX, "lastAccessedAt");
      }
      if (!database.objectStoreNames.contains(STATE_STORE)) {
        database.createObjectStore(STATE_STORE);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      finish(database);
    };
    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
  });
}

async function readStoredEntry(
  database: IDBDatabase,
  key: GridPosterCacheKey,
): Promise<StoredGridPosterEntry | null> {
  const transaction = database.transaction(ENTRY_STORE, "readonly");
  const request = transaction.objectStore(ENTRY_STORE).get(key);
  const result = await requestResult<StoredGridPosterEntry | undefined>(
    request,
  );
  await transactionDone(transaction);
  return result ?? null;
}

async function writeStoredEntry(
  database: IDBDatabase,
  key: GridPosterCacheKey,
  entry: GridPosterCacheEntry,
  lastAccessedAt: number,
): Promise<void> {
  const transaction = database.transaction(
    [ENTRY_STORE, RECENCY_STORE, STATE_STORE],
    "readwrite",
  );
  const entries = transaction.objectStore(ENTRY_STORE);
  const recency = transaction.objectStore(RECENCY_STORE);
  const state = transaction.objectStore(STATE_STORE);
  const previous = await requestResult<StoredGridPosterRecency | undefined>(
    recency.get(key),
  );
  const totals = normalizeTotals(
    await requestResult<StoredGridPosterTotals | undefined>(
      state.get(TOTALS_KEY),
    ),
  );
  const stored: StoredGridPosterEntry = {
    ...entry,
    bytes: new Blob([entry.bytes.slice()], { type: entry.mimeType }),
    streamSourceNames: [...entry.streamSourceNames],
    version: STORED_ENTRY_VERSION,
  };
  entries.put(stored, key);
  recency.put({
    byteLength: entry.bytes.byteLength,
    key,
    lastAccessedAt,
  } satisfies StoredGridPosterRecency);
  state.put(
    {
      entryCount: totals.entryCount + (previous ? 0 : 1),
      sizeBytes:
        totals.sizeBytes - (previous?.byteLength ?? 0) + entry.bytes.byteLength,
    } satisfies StoredGridPosterTotals,
    TOTALS_KEY,
  );
  await transactionDone(transaction);
}

async function touchStoredEntry(
  database: IDBDatabase,
  key: GridPosterCacheKey,
  lastAccessedAt: number,
): Promise<void> {
  try {
    const transaction = database.transaction(RECENCY_STORE, "readwrite");
    const recency = transaction.objectStore(RECENCY_STORE);
    const current = await requestResult<StoredGridPosterRecency | undefined>(
      recency.get(key),
    );
    if (current) {
      recency.put({
        ...current,
        lastAccessedAt,
      } satisfies StoredGridPosterRecency);
    }
    await transactionDone(transaction);
  } catch {
    // Recency updates are best-effort.
  }
}

async function deleteStoredEntry(
  database: IDBDatabase,
  key: GridPosterCacheKey,
): Promise<void> {
  try {
    const transaction = database.transaction(
      [ENTRY_STORE, RECENCY_STORE, STATE_STORE],
      "readwrite",
    );
    const recency = transaction.objectStore(RECENCY_STORE);
    const previous = await requestResult<StoredGridPosterRecency | undefined>(
      recency.get(key),
    );
    transaction.objectStore(ENTRY_STORE).delete(key);
    recency.delete(key);
    if (previous) {
      const state = transaction.objectStore(STATE_STORE);
      const totals = normalizeTotals(
        await requestResult<StoredGridPosterTotals | undefined>(
          state.get(TOTALS_KEY),
        ),
      );
      state.put(
        {
          entryCount: Math.max(0, totals.entryCount - 1),
          sizeBytes: Math.max(0, totals.sizeBytes - previous.byteLength),
        } satisfies StoredGridPosterTotals,
        TOTALS_KEY,
      );
    }
    await transactionDone(transaction);
  } catch {
    // Invalid entries may remain until later eviction if deletion fails.
  }
}

function enforceBudget(
  database: IDBDatabase,
  maxEntries: number,
  maxSizeBytes: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(
        [ENTRY_STORE, RECENCY_STORE, STATE_STORE],
        "readwrite",
      );
    } catch (error) {
      reject(error);
      return;
    }
    const entries = transaction.objectStore(ENTRY_STORE);
    const recency = transaction.objectStore(RECENCY_STORE);
    const state = transaction.objectStore(STATE_STORE);
    let totals: StoredGridPosterTotals = { entryCount: 0, sizeBytes: 0 };
    let finished = false;
    const fail = () => {
      if (finished) return;
      finished = true;
      reject(transaction.error ?? new Error("Grid poster eviction failed"));
    };
    transaction.onabort = fail;
    transaction.onerror = fail;
    transaction.oncomplete = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    const totalsRequest = state.get(TOTALS_KEY);
    totalsRequest.onerror = fail;
    totalsRequest.onsuccess = () => {
      totals = normalizeTotals(
        totalsRequest.result as StoredGridPosterTotals | undefined,
      );
      if (totals.entryCount <= maxEntries && totals.sizeBytes <= maxSizeBytes) {
        return;
      }
      const cursorRequest = recency.index(RECENCY_INDEX).openCursor();
      cursorRequest.onerror = fail;
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          state.put({ entryCount: 0, sizeBytes: 0 }, TOTALS_KEY);
          return;
        }
        if (
          totals.entryCount <= maxEntries &&
          totals.sizeBytes <= maxSizeBytes
        ) {
          state.put(totals, TOTALS_KEY);
          return;
        }
        const value = cursor.value as StoredGridPosterRecency;
        entries.delete(value.key);
        cursor.delete();
        totals = {
          entryCount: Math.max(0, totals.entryCount - 1),
          sizeBytes: Math.max(0, totals.sizeBytes - value.byteLength),
        };
        cursor.continue();
      };
    };
  });
}

async function decodeStoredEntry(
  stored: StoredGridPosterEntry | null,
): Promise<GridPosterCacheEntry | null> {
  if (!stored || !validStoredEntry(stored)) return null;
  const { bytes: storedBytes, version: _version, ...metadata } = stored;
  const entry: GridPosterCacheEntry = {
    ...metadata,
    bytes: new Uint8Array(await storedBytes.arrayBuffer()),
  };
  return validEntry(entry) ? entry : null;
}

function validStoredEntry(
  entry: StoredGridPosterEntry,
): entry is StoredGridPosterEntry {
  return (
    entry.version === STORED_ENTRY_VERSION &&
    typeof entry.bytes?.arrayBuffer === "function" &&
    entry.bytes.size > 0
  );
}

function validEntry(entry: GridPosterCacheEntry): boolean {
  return (
    entry.bytes instanceof Uint8Array &&
    entry.bytes.byteLength > 0 &&
    positiveDimension(entry.height) &&
    positiveDimension(entry.width) &&
    (entry.mimeType === "image/webp" || entry.mimeType === "image/png") &&
    (entry.sourceKind === "image" || entry.sourceKind === "point-cloud") &&
    (entry.streamId === null || typeof entry.streamId === "string") &&
    (entry.streamSourceName === null ||
      typeof entry.streamSourceName === "string") &&
    Array.isArray(entry.streamSourceNames) &&
    entry.streamSourceNames.every((name) => typeof name === "string") &&
    (entry.pointCloudPoseKey === undefined ||
      typeof entry.pointCloudPoseKey === "string")
  );
}

function positiveDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function normalizeTotals(
  totals: StoredGridPosterTotals | undefined,
): StoredGridPosterTotals {
  return {
    entryCount: Math.max(0, Math.floor(totals?.entryCount ?? 0)),
    sizeBytes: Math.max(0, Math.floor(totals?.sizeBytes ?? 0)),
  };
}

function requestResult<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () =>
      reject(request.error ?? new Error("Grid poster storage request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Grid poster transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Grid poster transaction failed"));
  });
}
