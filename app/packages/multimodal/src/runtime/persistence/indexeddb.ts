/** Lazy, best-effort connection to one IndexedDB database. */
export interface IndexedDbConnection {
  open(): Promise<IDBDatabase | null>;
}

/** Domain-owned database definition consumed by the shared lifecycle layer. */
export interface IndexedDbConnectionOptions {
  readonly name: string;
  /** Resolved for every open attempt. Defaults to `globalThis.indexedDB`. */
  readonly resolveFactory?: () => IDBFactory | null | undefined;
  readonly upgrade: (database: IDBDatabase) => void;
  readonly version: number;
}

/**
 * Creates a retryable IndexedDB connection. Unsupported, blocked, or failed
 * opens resolve to `null`; close and version-change events invalidate the
 * memoized connection so a later operation can try again.
 */
export function createIndexedDbConnection(
  options: IndexedDbConnectionOptions,
): IndexedDbConnection {
  const resolveFactory =
    options.resolveFactory ??
    (() =>
      (globalThis as typeof globalThis & { indexedDB?: IDBFactory }).indexedDB);
  let databasePromise: Promise<IDBDatabase | null> | null = null;

  return {
    open() {
      if (databasePromise) return databasePromise;
      const invalidate = () => {
        if (databasePromise === current) databasePromise = null;
      };
      const current = openDatabase(resolveFactory(), options, invalidate).then(
        (database) => {
          if (!database) invalidate();
          return database;
        },
      );
      databasePromise = current;
      return current;
    },
  };
}

/** Resolves one IndexedDB request or rejects with its storage error. */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB storage request failed"));
  });
}

/** Resolves when one IndexedDB transaction commits successfully. */
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(
  factory: IDBFactory | null | undefined,
  options: IndexedDbConnectionOptions,
  invalidate: () => void,
): Promise<IDBDatabase | null> {
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
      request = factory.open(options.name, options.version);
    } catch {
      finish(null);
      return;
    }
    request.onupgradeneeded = () => options.upgrade(request.result);
    request.onsuccess = () => {
      const database = request.result;
      database.onclose = invalidate;
      database.onversionchange = () => {
        database.close();
        invalidate();
      };
      finish(database);
    };
    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
  });
}
