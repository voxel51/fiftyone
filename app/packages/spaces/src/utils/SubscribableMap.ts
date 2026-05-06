type Listener = () => void;

export class SubscribableMap<K, V> {
  private renderers = new Map<K, V>();
  private listeners = new Set<Listener>();
  private snapshot: ReadonlyMap<K, V> = this.renderers;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ReadonlyMap<K, V> => this.snapshot;

  get(key: K): V | undefined {
    return this.renderers.get(key);
  }

  set(key: K, value: V): void {
    this.renderers.set(key, value);
    this.bumpSnapshot();
  }

  delete(key: K): boolean {
    const existed = this.renderers.delete(key);
    if (existed) this.bumpSnapshot();
    return existed;
  }

  private bumpSnapshot() {
    // useSyncExternalStore compares snapshots by reference, so hand out a new
    // Map on every mutation to trigger subscribed components.
    this.snapshot = new Map(this.renderers);
    for (const listener of this.listeners) listener();
  }
}
