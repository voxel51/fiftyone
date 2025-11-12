import { getEventBus } from "../dispatch";
import { EventGroup } from "../types";

/**
 * Per-event state tracking. Each event type has its own state and listeners.
 */
class EventStateTracker<K> {
  private state: K | undefined = undefined;
  private listeners: Set<() => void> = new Set();
  private unsubscribeCallback: (() => void) | null = null;
  private refCount = 0;

  /**
   * Subscribe to event updates. Returns unsubscribe function.
   */
  subscribe(
    callback: () => void,
    bus: any,
    event: string | number | symbol
  ): () => void {
    this.listeners.add(callback);
    this.refCount++;

    // Subscribe to the event bus if this is the first listener
    if (this.refCount === 1 && !this.unsubscribeCallback) {
      const handler = (data: K) => {
        this.state = data;
        // Notify all listeners
        this.listeners.forEach((listener) => listener());
      };

      bus.on(event, handler);
      this.unsubscribeCallback = () => {
        bus.off(event, handler);
      };
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
      this.refCount--;

      // Unsubscribe from event bus if no listeners remain
      if (this.refCount === 0 && this.unsubscribeCallback) {
        this.unsubscribeCallback();
        this.unsubscribeCallback = null;
        this.state = undefined;
      }
    };
  }

  /**
   * Get the current snapshot of state.
   */
  getSnapshot(): K | undefined {
    return this.state;
  }

  /**
   * Get the current snapshot with a default value.
   */
  getSnapshotWithDefault(defaultValue: K): K {
    return this.state ?? defaultValue;
  }
}

/**
 * Store that tracks the latest payload for each event type.
 * This enables state derivation from events using useSyncExternalStore,
 * preventing tearing in concurrent React rendering.
 *
 * @template T - EventGroup type defining event types and payloads
 */
export class EventStateStore<T extends EventGroup> {
  private trackers: Map<keyof T, EventStateTracker<T[keyof T]>> = new Map();
  private subscriptions: Map<
    keyof T,
    {
      subscribe: (callback: () => void) => () => void;
      getSnapshot: () => T[keyof T] | undefined;
      getSnapshotWithDefault: (defaultValue: T[keyof T]) => T[keyof T];
    }
  > = new Map();

  /**
   * Get or create a tracker for a specific event type.
   */
  private getTracker<K extends keyof T>(event: K): EventStateTracker<T[K]> {
    if (!this.trackers.has(event)) {
      this.trackers.set(event, new EventStateTracker<T[K]>());
    }
    return this.trackers.get(event) as EventStateTracker<T[K]>;
  }

  /**
   * Create a subscribe/getSnapshot pair for a specific event.
   * This is used by useSyncExternalStore to track state for a single event.
   * The subscription object is memoized per event to prevent unnecessary re-subscriptions.
   */
  createSubscription<K extends keyof T>(
    event: K
  ): {
    subscribe: (callback: () => void) => () => void;
    getSnapshot: () => T[K] | undefined;
    getSnapshotWithDefault: (defaultValue: T[K]) => T[K];
  } {
    // Return memoized subscription if it exists
    const existing = this.subscriptions.get(event);
    if (existing) {
      return existing as {
        subscribe: (callback: () => void) => () => void;
        getSnapshot: () => T[K] | undefined;
        getSnapshotWithDefault: (defaultValue: T[K]) => T[K];
      };
    }

    const tracker = this.getTracker(event);
    const bus = getEventBus<T>();

    const subscription = {
      subscribe: (callback: () => void) => {
        return tracker.subscribe(callback, bus, event);
      },
      getSnapshot: (): T[K] | undefined => tracker.getSnapshot(),
      getSnapshotWithDefault: (defaultValue: T[K]): T[K] =>
        tracker.getSnapshotWithDefault(defaultValue),
    };

    this.subscriptions.set(event, subscription);
    return subscription;
  }

  /**
   * Cleanup: clear all trackers and subscriptions.
   * Useful for testing or when the store is no longer needed.
   */
  cleanup(): void {
    this.trackers.clear();
    this.subscriptions.clear();
  }
}

/**
 * Registry of EventStateStore instances by channel ID.
 * Similar to the dispatcher registry, but for state stores.
 */
const stateStoreRegistry = new Map<string, EventStateStore<any>>();

/**
 * Gets or creates an EventStateStore for the given channel ID.
 * By default, uses "default" channel to match the event bus.
 */
export function getEventStateStore<T extends EventGroup>(
  channelId: string = "default"
): EventStateStore<T> {
  if (!stateStoreRegistry.has(channelId)) {
    stateStoreRegistry.set(channelId, new EventStateStore<T>());
  }
  return stateStoreRegistry.get(channelId) as EventStateStore<T>;
}

/**
 * Exports the registry for testing purposes.
 */
export const __test__ = {
  registry: stateStoreRegistry,
};
