import {
  decodeStoredSourceFacts,
  encodeStoredSourceFacts,
} from "./source-facts-codec";
import type { StoredSourceFactsV1 } from "./source-facts";
import {
  createIndexedDbConnection,
  requestResult,
  transactionDone,
} from "./persistence/indexeddb";

const MIB = 1024 * 1024;
/** IndexedDB database owned by the multimodal runtime source-facts tier. */
export const SOURCE_FACTS_DATABASE_NAME = "fiftyone-multimodal-source-facts";
const DATABASE_VERSION = 1;
const ENTRY_STORE = "entries";
const RECENCY_STORE = "recency";
const RECENCY_INDEX = "last-accessed";
const STORED_ENVELOPE_VERSION = 1;

/** Hard ceiling on durable source-facts entries. */
export const SOURCE_FACTS_MAX_ENTRIES = 512;
/** Hard ceiling on aggregate encoded source-facts bytes. */
export const SOURCE_FACTS_MAX_TOTAL_BYTES = 32 * MIB;
/** Hard ceiling on one encoded source-facts entry. */
export const SOURCE_FACTS_MAX_ENTRY_BYTES = 2 * MIB;

interface StoredSourceFactsEnvelope {
  readonly encoded: string;
  readonly version: typeof STORED_ENVELOPE_VERSION;
}

/** Recency metadata retained separately from the larger facts payload. */
export interface StoredSourceFactsRecency {
  readonly byteLength: number;
  readonly key: string;
  readonly lastAccessedAt: number;
}

/** Best-effort durable repository for validated source-facts values. */
export interface SourceFactsPersistence {
  clear(): Promise<void>;
  delete(key: string, expectedCreatedAt?: number): Promise<void>;
  get(key: string): Promise<StoredSourceFactsV1 | null>;
  put(key: string, entry: StoredSourceFactsV1): Promise<SourceFactsWriteResult>;
}

/** Observable outcome of one best-effort durable write. */
export interface SourceFactsWriteResult {
  readonly byteLength?: number;
  readonly stored: boolean;
}

/** Testable options for constructing an IndexedDB repository. */
export interface SourceFactsPersistenceOptions {
  readonly factory?: IDBFactory | null;
  readonly maxEntries?: number;
  readonly maxEntryBytes?: number;
  readonly maxTotalBytes?: number;
}

/**
 * Creates the reload-surviving source-facts repository. Storage denial,
 * lifecycle failures, corrupt values, and quota pressure all degrade to a
 * miss; none of these operations is allowed to become a product error.
 */
export function createIndexedDbSourceFactsPersistence(
  options: SourceFactsPersistenceOptions = {},
): SourceFactsPersistence {
  const maxEntries = options.maxEntries ?? SOURCE_FACTS_MAX_ENTRIES;
  const maxEntryBytes = options.maxEntryBytes ?? SOURCE_FACTS_MAX_ENTRY_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? SOURCE_FACTS_MAX_TOTAL_BYTES;
  const connection = createIndexedDbConnection({
    name: SOURCE_FACTS_DATABASE_NAME,
    ...(options.factory !== undefined
      ? { resolveFactory: () => options.factory }
      : {}),
    upgrade: upgradeSourceFactsDatabase,
    version: DATABASE_VERSION,
  });
  const pendingReads = new Map<string, Promise<StoredSourceFactsV1 | null>>();
  let mutationChain = Promise.resolve();

  const enqueueMutation = (operation: () => Promise<void>): Promise<void> => {
    const pending = mutationChain.catch(() => undefined).then(operation);
    mutationChain = pending.catch(() => undefined);
    return pending;
  };

  const read = async (key: string): Promise<StoredSourceFactsV1 | null> => {
    const database = await connection.open();
    if (!database) return null;
    try {
      const envelope = await readEnvelope(database, key);
      if (!validEnvelope(envelope)) {
        if (envelope) {
          void enqueueMutation(() => deleteEntry(database, key)).catch(
            () => undefined,
          );
        }
        return null;
      }
      const entry = decodeStoredSourceFacts(envelope.encoded);
      if (!entry) {
        void enqueueMutation(() => deleteEntry(database, key)).catch(
          () => undefined,
        );
        return null;
      }
      // Advisory recency must never delay delivery of a visible hit.
      void touchEntry(database, key, envelope.encoded, Date.now());
      return entry;
    } catch {
      return null;
    }
  };

  return {
    async clear() {
      const database = await connection.open();
      if (!database) return;
      await enqueueMutation(() => clearEntries(database)).catch(
        () => undefined,
      );
    },

    async delete(key, expectedCreatedAt) {
      const database = await connection.open();
      if (!database) return;
      await enqueueMutation(() =>
        deleteEntry(database, key, expectedCreatedAt),
      ).catch(() => undefined);
    },

    get(key) {
      let pending = pendingReads.get(key);
      if (!pending) {
        pending = read(key).finally(() => pendingReads.delete(key));
        pendingReads.set(key, pending);
      }
      return pending;
    },

    async put(key, entry) {
      const encoded = encodeStoredSourceFacts(entry);
      if (!encoded || encoded.byteLength > maxEntryBytes) {
        return { stored: false };
      }
      const database = await connection.open();
      if (!database) return { stored: false };
      try {
        await enqueueMutation(async () => {
          await writeEntry(database, key, encoded, Date.now());
          await enforceBudget(database, maxEntries, maxTotalBytes);
        });
        return { byteLength: encoded.byteLength, stored: true };
      } catch {
        return { stored: false };
      }
    },
  };
}

let singleton: SourceFactsPersistence = createIndexedDbSourceFactsPersistence();

/** Returns the process-local durable source-facts repository. */
export function getSourceFactsPersistence(): SourceFactsPersistence {
  return singleton;
}

/** Replaces the durable repository for deterministic tests. */
export function resetSourceFactsPersistenceForTests(
  persistence?: SourceFactsPersistence,
): void {
  singleton = persistence ?? createIndexedDbSourceFactsPersistence();
}

/** Selects oldest entries until both configured budgets are satisfied. */
export function selectSourceFactsEvictions(
  recency: readonly StoredSourceFactsRecency[],
  maxEntries: number,
  maxTotalBytes: number,
): readonly string[] {
  const ordered = recency
    .filter(validRecency)
    .slice()
    .sort(
      (left, right) =>
        left.lastAccessedAt - right.lastAccessedAt ||
        left.key.localeCompare(right.key),
    );
  let entryCount = ordered.length;
  let totalBytes = ordered.reduce(
    (total, entry) => total + entry.byteLength,
    0,
  );
  const evictions: string[] = [];
  for (const entry of ordered) {
    if (entryCount <= maxEntries && totalBytes <= maxTotalBytes) break;
    evictions.push(entry.key);
    entryCount--;
    totalBytes -= entry.byteLength;
  }
  return evictions;
}

function upgradeSourceFactsDatabase(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(ENTRY_STORE)) {
    database.createObjectStore(ENTRY_STORE);
  }
  if (!database.objectStoreNames.contains(RECENCY_STORE)) {
    const store = database.createObjectStore(RECENCY_STORE, {
      keyPath: "key",
    });
    store.createIndex(RECENCY_INDEX, "lastAccessedAt");
  }
}

async function readEnvelope(
  database: IDBDatabase,
  key: string,
): Promise<unknown> {
  const transaction = database.transaction(ENTRY_STORE, "readonly");
  const value = await requestResult<unknown>(
    transaction.objectStore(ENTRY_STORE).get(key),
  );
  await transactionDone(transaction);
  return value;
}

async function writeEntry(
  database: IDBDatabase,
  key: string,
  encoded: { readonly byteLength: number; readonly value: string },
  lastAccessedAt: number,
): Promise<void> {
  const transaction = database.transaction(
    [ENTRY_STORE, RECENCY_STORE],
    "readwrite",
  );
  transaction.objectStore(ENTRY_STORE).put(
    {
      encoded: encoded.value,
      version: STORED_ENVELOPE_VERSION,
    } satisfies StoredSourceFactsEnvelope,
    key,
  );
  transaction.objectStore(RECENCY_STORE).put({
    byteLength: encoded.byteLength,
    key,
    lastAccessedAt,
  } satisfies StoredSourceFactsRecency);
  await transactionDone(transaction);
}

async function touchEntry(
  database: IDBDatabase,
  key: string,
  encoded: string,
  lastAccessedAt: number,
): Promise<void> {
  try {
    const transaction = database.transaction(RECENCY_STORE, "readwrite");
    const store = transaction.objectStore(RECENCY_STORE);
    const current = await requestResult<unknown>(store.get(key));
    if (validRecency(current)) {
      store.put({
        ...current,
        lastAccessedAt,
      } satisfies StoredSourceFactsRecency);
    } else {
      store.put({
        byteLength: new TextEncoder().encode(encoded).byteLength,
        key,
        lastAccessedAt,
      } satisfies StoredSourceFactsRecency);
    }
    await transactionDone(transaction);
  } catch {
    // Recency is advisory; a valid entry remains a hit if this update fails.
  }
}

async function deleteEntry(
  database: IDBDatabase,
  key: string,
  expectedCreatedAt?: number,
): Promise<void> {
  const transaction = database.transaction(
    [ENTRY_STORE, RECENCY_STORE],
    "readwrite",
  );
  const entries = transaction.objectStore(ENTRY_STORE);
  if (expectedCreatedAt !== undefined) {
    const envelope = await requestResult<unknown>(entries.get(key));
    const current = validEnvelope(envelope)
      ? decodeStoredSourceFacts(envelope.encoded)
      : null;
    if (current?.createdAt !== expectedCreatedAt) {
      await transactionDone(transaction);
      return;
    }
  }
  entries.delete(key);
  transaction.objectStore(RECENCY_STORE).delete(key);
  await transactionDone(transaction);
}

async function clearEntries(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction(
    [ENTRY_STORE, RECENCY_STORE],
    "readwrite",
  );
  transaction.objectStore(ENTRY_STORE).clear();
  transaction.objectStore(RECENCY_STORE).clear();
  await transactionDone(transaction);
}

async function enforceBudget(
  database: IDBDatabase,
  maxEntries: number,
  maxTotalBytes: number,
): Promise<void> {
  const read = database.transaction(RECENCY_STORE, "readonly");
  const recency = await requestResult<unknown[]>(
    read.objectStore(RECENCY_STORE).getAll(),
  );
  await transactionDone(read);
  const invalidKeys = recency.flatMap((entry) =>
    !validRecency(entry) && isRecord(entry) && typeof entry.key === "string"
      ? [entry.key]
      : [],
  );
  const valid = recency.filter(validRecency);
  const evictions = [
    ...new Set([
      ...invalidKeys,
      ...selectSourceFactsEvictions(valid, maxEntries, maxTotalBytes),
    ]),
  ];
  if (evictions.length === 0) return;
  const write = database.transaction([ENTRY_STORE, RECENCY_STORE], "readwrite");
  const entries = write.objectStore(ENTRY_STORE);
  const access = write.objectStore(RECENCY_STORE);
  for (const key of evictions) {
    entries.delete(key);
    access.delete(key);
  }
  await transactionDone(write);
}

function validEnvelope(value: unknown): value is StoredSourceFactsEnvelope {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "encoded" || key === "version") &&
    value.version === STORED_ENVELOPE_VERSION &&
    typeof value.encoded === "string"
  );
}

function validRecency(value: unknown): value is StoredSourceFactsRecency {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    Number.isSafeInteger(value.byteLength) &&
    (value.byteLength as number) >= 0 &&
    typeof value.lastAccessedAt === "number" &&
    Number.isFinite(value.lastAccessedAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
