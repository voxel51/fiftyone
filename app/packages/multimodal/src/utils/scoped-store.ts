/** A scoped value paired with the timestamp used for LRU eviction. */
export interface TimestampedScopedValue<Value> {
  readonly updatedAtMs: number;
  readonly value: Value;
}

/** Sanitized view of one versioned scoped persistence payload. */
export interface ScopedStoreSnapshot<ScopeValue, FallbackValue> {
  readonly fallback?: FallbackValue;
  readonly scopes: Readonly<Record<string, TimestampedScopedValue<ScopeValue>>>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface FallbackOptions<FallbackValue> {
  readonly location: "root" | { readonly field: string };
  readonly sanitize: (raw: unknown) => FallbackValue | null | undefined;
  readonly serialize: (
    value: FallbackValue,
  ) => Readonly<Record<string, unknown>>;
}

export interface TimestampLruScopedStoreOptions<ScopeValue, FallbackValue> {
  /** Allows a one-time migration from the same key's pre-version payload. */
  readonly acceptUnversioned?: boolean;
  readonly fallback?: FallbackOptions<FallbackValue>;
  readonly key: string;
  readonly maxScopes: number;
  readonly normalizeScopeKey?: (raw: string) => string | null;
  readonly sanitizeScope: (raw: unknown) => ScopeValue | null | undefined;
  readonly scopeField: string;
  readonly serializeScope: (
    value: ScopeValue,
  ) => Readonly<Record<string, unknown>>;
  readonly storage: () => StorageLike | null | undefined;
  readonly version: number;
}

export interface TimestampLruScopedStore<ScopeValue, FallbackValue> {
  readFallback(): FallbackValue | null;
  readScope(scopeKey: string): ScopeValue | null;
  readSnapshot(): ScopedStoreSnapshot<ScopeValue, FallbackValue>;
  replace(snapshot: {
    readonly fallback?: FallbackValue;
    readonly scopes: Readonly<Record<string, ScopeValue>>;
  }): void;
  updateFallback(
    resolver: (current: FallbackValue | null) => FallbackValue | null,
  ): FallbackValue | null;
  updateScope(
    scopeKey: string,
    resolver: (current: ScopeValue | null) => ScopeValue | null,
  ): ScopeValue | null;
}

const EMPTY_SCOPES = Object.freeze({});

/**
 * Creates one best-effort, versioned scoped store with timestamp-LRU
 * eviction. Domain modules retain ownership of field sanitization and wire
 * field names; this engine owns parsing, caching, layering, timestamps, caps,
 * and storage failure handling.
 */
export function createTimestampLruScopedStore<
  ScopeValue,
  FallbackValue = never,
>(
  options: TimestampLruScopedStoreOptions<ScopeValue, FallbackValue>,
): TimestampLruScopedStore<ScopeValue, FallbackValue> {
  let cachedRaw: string | null | undefined;
  let cachedSnapshot: ScopedStoreSnapshot<ScopeValue, FallbackValue> | null =
    null;

  const emptySnapshot = (): ScopedStoreSnapshot<ScopeValue, FallbackValue> => ({
    scopes: EMPTY_SCOPES,
  });

  const readSnapshot = (): ScopedStoreSnapshot<ScopeValue, FallbackValue> => {
    try {
      const raw = options.storage()?.getItem(options.key) ?? null;
      if (raw === cachedRaw) return cachedSnapshot ?? emptySnapshot();
      cachedRaw = raw;
      cachedSnapshot = null;
      if (!raw) return emptySnapshot();

      const parsed: unknown = JSON.parse(raw);
      if (
        !isRecord(parsed) ||
        (parsed.version !== options.version &&
          !(options.acceptUnversioned && parsed.version === undefined))
      ) {
        return emptySnapshot();
      }

      const scopes: Record<string, TimestampedScopedValue<ScopeValue>> = {};
      const rawScopes = parsed[options.scopeField];
      if (isRecord(rawScopes)) {
        for (const [rawKey, rawEntry] of Object.entries(rawScopes)) {
          const scopeKey = normalizeScopeKey(rawKey, options.normalizeScopeKey);
          if (!scopeKey) continue;
          const value = options.sanitizeScope(rawEntry);
          if (value === null || value === undefined) continue;
          const updatedAtMs = isRecord(rawEntry)
            ? finiteTimestamp(rawEntry.updatedAtMs)
            : 0;
          scopes[scopeKey] = { updatedAtMs, value };
        }
      }
      evictLeastRecentlyUpdated(scopes, options.maxScopes);

      const fallback = readFallback(parsed, options.fallback);
      cachedSnapshot = {
        ...(fallback === null ? {} : { fallback }),
        scopes,
      };
      return cachedSnapshot;
    } catch {
      cachedSnapshot = null;
      return emptySnapshot();
    }
  };

  const writeSnapshot = (
    snapshot: ScopedStoreSnapshot<ScopeValue, FallbackValue>,
  ): void => {
    try {
      const storage = options.storage();
      if (!storage) return;
      const serializedScopes = Object.fromEntries(
        Object.entries(snapshot.scopes).map(([scopeKey, entry]) => [
          scopeKey,
          {
            ...options.serializeScope(entry.value),
            updatedAtMs: entry.updatedAtMs,
          },
        ]),
      );
      const fallback = snapshot.fallback;
      const rootFallback =
        fallback !== undefined && options.fallback?.location === "root"
          ? options.fallback.serialize(fallback)
          : {};
      const wire: Record<string, unknown> = {
        ...rootFallback,
        version: options.version,
        [options.scopeField]: serializedScopes,
      };
      if (
        fallback !== undefined &&
        options.fallback &&
        options.fallback.location !== "root"
      ) {
        wire[options.fallback.location.field] =
          options.fallback.serialize(fallback);
      }
      const raw = JSON.stringify(wire);
      storage.setItem(options.key, raw);
      cachedRaw = raw;
      cachedSnapshot = snapshot;
    } catch {
      // Persistence is always a convenience; callers retain in-memory state.
    }
  };

  return {
    readFallback() {
      return readSnapshot().fallback ?? null;
    },
    readScope(scopeKey) {
      const normalized = normalizeScopeKey(scopeKey, options.normalizeScopeKey);
      return normalized
        ? (readSnapshot().scopes[normalized]?.value ?? null)
        : null;
    },
    readSnapshot,
    replace(snapshot) {
      const updatedAtMs = Date.now();
      const scopes: Record<string, TimestampedScopedValue<ScopeValue>> = {};
      for (const [rawKey, rawValue] of Object.entries(snapshot.scopes)) {
        const scopeKey = normalizeScopeKey(rawKey, options.normalizeScopeKey);
        if (!scopeKey) continue;
        const value = options.sanitizeScope(rawValue);
        if (value === null || value === undefined) continue;
        scopes[scopeKey] = { updatedAtMs, value };
      }
      evictLeastRecentlyUpdated(scopes, options.maxScopes);
      const fallback =
        snapshot.fallback === undefined
          ? undefined
          : options.fallback?.sanitize(snapshot.fallback);
      writeSnapshot({
        ...(fallback === null || fallback === undefined ? {} : { fallback }),
        scopes,
      });
    },
    updateFallback(resolver) {
      const current = readSnapshot();
      const resolved = resolver(current.fallback ?? null);
      const nextFallback =
        resolved === null
          ? null
          : (options.fallback?.sanitize(resolved) ?? null);
      const next = {
        ...(nextFallback === null ? {} : { fallback: nextFallback }),
        scopes: current.scopes,
      };
      writeSnapshot(next);
      return nextFallback;
    },
    updateScope(scopeKey, resolver) {
      const normalized = normalizeScopeKey(scopeKey, options.normalizeScopeKey);
      if (!normalized) return null;
      const current = readSnapshot();
      const resolved = resolver(current.scopes[normalized]?.value ?? null);
      const nextValue =
        resolved === null ? null : (options.sanitizeScope(resolved) ?? null);
      const scopes = { ...current.scopes };
      if (nextValue === null) {
        delete scopes[normalized];
      } else {
        scopes[normalized] = { updatedAtMs: Date.now(), value: nextValue };
      }
      evictLeastRecentlyUpdated(scopes, options.maxScopes);
      writeSnapshot({
        ...(current.fallback === undefined
          ? {}
          : { fallback: current.fallback }),
        scopes,
      });
      return nextValue;
    },
  };
}

function readFallback<FallbackValue>(
  parsed: Readonly<Record<string, unknown>>,
  fallback: FallbackOptions<FallbackValue> | undefined,
): FallbackValue | null {
  if (!fallback) return null;
  const raw =
    fallback.location === "root" ? parsed : parsed[fallback.location.field];
  if (raw === undefined) return null;
  return fallback.sanitize(raw) ?? null;
}

function normalizeScopeKey(
  raw: string,
  normalize: ((raw: string) => string | null) | undefined,
): string | null {
  return normalize ? normalize(raw) : raw || null;
}

function finiteTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function evictLeastRecentlyUpdated<Value>(
  scopes: Record<string, TimestampedScopedValue<Value>>,
  maxScopes: number,
): void {
  const overflow = Object.keys(scopes).length - Math.max(0, maxScopes);
  if (overflow <= 0) return;
  Object.entries(scopes)
    .sort(([, a], [, b]) => a.updatedAtMs - b.updatedAtMs)
    .slice(0, overflow)
    .forEach(([scopeKey]) => delete scopes[scopeKey]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
