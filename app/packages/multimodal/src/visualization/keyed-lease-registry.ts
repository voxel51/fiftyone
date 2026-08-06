/** Retention counts for a keyed lease registry. */
export interface KeyedLeaseRegistryStats {
  /** Current entries with at least one live lease. */
  readonly activeCount: number;
  readonly entryCount: number;
  /** Superseded entries waiting for their final lease to release. */
  readonly retiredCount: number;
}

interface KeyedLeaseRegistryOptions<Key, Input, Resource extends object> {
  readonly create: (key: Key, input: Input) => Resource;
  readonly dispose: (resource: Resource) => void;
  readonly needsGrowth: (resource: Resource, input: Input) => boolean;
  readonly retentionCap: number;
  /** Whether retaining an active entry refreshes its LRU position. */
  readonly touchOnRetain?: boolean;
  readonly update: (resource: Resource, input: Input) => void;
}

/** Grow-only keyed storage with idempotent leases and deferred retirement. */
export interface KeyedLeaseRegistry<Key, Input, Resource extends object> {
  get(key: Key, input: Input): Resource;
  releaseAll(): void;
  retain(resource: Resource): () => void;
  retireWhere(predicate: (key: Key, resource: Resource) => boolean): void;
  stats(): KeyedLeaseRegistryStats;
}

interface ResourceEntry<Key, Resource> {
  disposed: boolean;
  readonly key: Key;
  readonly resource: Resource;
  retired: boolean;
  retainCount: number;
}

/**
 * Creates a grow-only keyed resource registry with commit-safe LRU eviction.
 *
 * Growth publishes replacement storage immediately and retires the previous
 * resource until committed consumers release it. Unleased eviction is
 * deferred one microtask so React layout effects can retain resources created
 * during the same commit.
 */
export function createKeyedLeaseRegistry<Key, Input, Resource extends object>({
  create,
  dispose,
  needsGrowth,
  retentionCap,
  touchOnRetain = false,
  update,
}: KeyedLeaseRegistryOptions<Key, Input, Resource>): KeyedLeaseRegistry<
  Key,
  Input,
  Resource
> {
  const entries = new Map<Key, ResourceEntry<Key, Resource>>();
  const entriesByResource = new WeakMap<
    Resource,
    ResourceEntry<Key, Resource>
  >();
  const retiredEntries = new Set<ResourceEntry<Key, Resource>>();
  let evictionScheduled = false;

  const disposeEntry = (entry: ResourceEntry<Key, Resource>) => {
    if (entry.disposed) return;
    entry.disposed = true;
    dispose(entry.resource);
  };

  const scheduleRetiredDisposal = () => {
    // Retirement and final release can occur in either order. Coalesce both
    // and dispose only after no committed consumer still holds the resource.
    queueMicrotask(() => {
      for (const entry of retiredEntries) {
        if (entry.retainCount !== 0) continue;
        retiredEntries.delete(entry);
        disposeEntry(entry);
      }
    });
  };

  const scheduleEviction = () => {
    if (evictionScheduled || entries.size <= retentionCap) return;
    evictionScheduled = true;
    queueMicrotask(() => {
      evictionScheduled = false;
      while (entries.size > retentionCap) {
        let evicted = false;
        for (const [key, entry] of entries) {
          if (entry.retainCount !== 0) continue;
          entries.delete(key);
          disposeEntry(entry);
          evicted = true;
          break;
        }
        if (!evicted) break;
      }
    });
  };

  const touch = (key: Key, entry: ResourceEntry<Key, Resource>) => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const createEntry = (key: Key, input: Input) => {
    const entry: ResourceEntry<Key, Resource> = {
      disposed: false,
      key,
      resource: create(key, input),
      retired: false,
      retainCount: 0,
    };
    entriesByResource.set(entry.resource, entry);
    return entry;
  };

  return {
    get: (key, input) => {
      let entry = entries.get(key);
      if (!entry) {
        entry = createEntry(key, input);
        entries.set(key, entry);
        scheduleEviction();
        return entry.resource;
      }

      touch(key, entry);
      if (needsGrowth(entry.resource, input)) {
        entry.retired = true;
        retiredEntries.add(entry);
        entry = createEntry(key, input);
        entries.set(key, entry);
        scheduleRetiredDisposal();
        return entry.resource;
      }

      update(entry.resource, input);
      return entry.resource;
    },
    releaseAll: () => {
      for (const entry of entries.values()) disposeEntry(entry);
      for (const entry of retiredEntries) disposeEntry(entry);
      entries.clear();
      retiredEntries.clear();
      evictionScheduled = false;
    },
    retain: (resource) => {
      const entry = entriesByResource.get(resource);
      if (!entry || entry.disposed) return () => undefined;
      entry.retainCount += 1;
      if (touchOnRetain && entries.get(entry.key) === entry) {
        touch(entry.key, entry);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        entry.retainCount = Math.max(0, entry.retainCount - 1);
        if (entry.retired) scheduleRetiredDisposal();
        else scheduleEviction();
      };
    },
    retireWhere: (predicate) => {
      for (const [key, entry] of entries) {
        if (!predicate(key, entry.resource)) continue;
        entries.delete(key);
        entry.retired = true;
        retiredEntries.add(entry);
      }
      scheduleRetiredDisposal();
    },
    stats: () => {
      let activeCount = 0;
      for (const entry of entries.values()) {
        if (entry.retainCount > 0) activeCount += 1;
      }
      return {
        activeCount,
        entryCount: entries.size,
        retiredCount: retiredEntries.size,
      };
    },
  };
}
