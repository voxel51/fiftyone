type BoundedLruCacheOptions<Key, Value> = {
  maxEntries: number;
  maxBytes?: number | null;
  getSizeBytes?: (value: Value, key: Key) => number;
  onEvict?: (value: Value, key: Key) => void;
};

type CacheEntry<Value> = {
  value: Value;
  sizeBytes: number;
};

/** Small `Map`-backed LRU cache with optional byte-budget eviction. */
export class BoundedLruCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly getSizeBytes:
    | ((value: Value, key: Key) => number)
    | undefined;
  private readonly onEvict: ((value: Value, key: Key) => void) | undefined;
  private totalBytes = 0;

  constructor(options: BoundedLruCacheOptions<Key, Value>) {
    this.maxEntries = Math.max(1, options.maxEntries);
    this.maxBytes =
      options.maxBytes === undefined || options.maxBytes === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, options.maxBytes);
    this.getSizeBytes = options.getSizeBytes;
    this.onEvict = options.onEvict;
  }

  get(key: Key) {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  peek(key: Key) {
    return this.entries.get(key)?.value;
  }

  set(key: Key, value: Value, sizeBytes?: number) {
    this.delete(key);
    const normalizedSize = this.normalizeSizeBytes(
      sizeBytes ?? this.getSizeBytes?.(value, key)
    );
    this.entries.set(key, {
      value,
      sizeBytes: normalizedSize,
    });
    this.totalBytes += normalizedSize;
    this.evictIfNeeded();
    return value;
  }

  updateSize(key: Key, sizeBytes: number) {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    const normalizedSize = this.normalizeSizeBytes(sizeBytes);
    this.totalBytes += normalizedSize - entry.sizeBytes;
    entry.sizeBytes = normalizedSize;
    this.evictIfNeeded();
  }

  has(key: Key) {
    return this.entries.has(key);
  }

  delete(key: Key) {
    return this.remove(key);
  }

  clear() {
    Array.from(this.entries.keys()).forEach((key) => {
      this.remove(key);
    });
  }

  forEach(callback: (value: Value, key: Key) => void) {
    this.entries.forEach((entry, key) => {
      callback(entry.value, key);
    });
  }

  get size() {
    return this.entries.size;
  }

  get bytesUsed() {
    return this.totalBytes;
  }

  private evictIfNeeded() {
    while (
      this.entries.size > this.maxEntries ||
      this.totalBytes > this.maxBytes
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }

      this.remove(oldestKey);
    }
  }

  private remove(key: Key) {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }

    this.entries.delete(key);
    this.totalBytes -= entry.sizeBytes;
    this.onEvict?.(entry.value, key);
    return true;
  }

  private normalizeSizeBytes(sizeBytes: number | undefined) {
    if (!sizeBytes || !Number.isFinite(sizeBytes)) {
      return 0;
    }

    return Math.max(0, Math.round(sizeBytes));
  }
}
