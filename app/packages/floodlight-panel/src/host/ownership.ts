import type { Hide, ID, Show } from "@fiftyone/floodlight";

/** The item callbacks a Floodlight instance renders through. */
export interface Renderer<K, V> {
  detachItem: (id: ID) => void;
  hideItem: Hide;
  showItem: Show<K, V>;
}

/** Which instance owns each item; shared by the instances sharing an item cache. */
export type Ownership = Map<string, symbol>;

export const createOwnership = (): Ownership => new Map();

/** A renderer scoped to one instance, with controls for handing items over. */
export interface Scoped<K, V> extends Renderer<K, V> {
  /** Record shows instead of performing them, while a visible instance holds the items. */
  defer(): void;
  /** Perform the recorded shows and stop deferring. */
  flush(): void;
  /** Make every later call a no-op, for an instance that has been replaced. */
  retire(): void;
}

type ShowArgs<K, V> = Parameters<Show<K, V>>[0];

/**
 * Scopes a shared renderer to one instance: the instance that showed an item
 * last owns it, and only the owner may hide or detach it. Without this, an
 * instance torn down after another took over its items would pull them out
 * of the new instance's tiles.
 */
export const scopeRenderer = <K, V>(
  renderer: Renderer<K, V>,
  shared: Ownership,
): Scoped<K, V> => {
  const scope = Symbol("instance");
  const owns = (id: ID) => shared.get(id.description) === scope;
  const deferred = new Map<string, ShowArgs<K, V>>();
  let deferring = false;
  let retired = false;

  const show = (args: ShowArgs<K, V>) => {
    shared.set(args.id.description, scope);
    return renderer.showItem(args);
  };

  return {
    showItem: (args) => {
      if (retired) return Promise.resolve(0);
      if (!deferring) return show(args);
      deferred.set(args.id.description, args);
      return Promise.resolve(0);
    },
    hideItem: (args) => {
      if (retired) return;
      if (deferring) deferred.delete(args.id.description);
      else if (owns(args.id)) renderer.hideItem(args);
    },
    detachItem: (id) => {
      if (retired) return;
      deferred.delete(id.description);
      if (!owns(id)) return;
      shared.delete(id.description);
      renderer.detachItem(id);
    },
    defer: () => {
      deferring = true;
    },
    flush: () => {
      deferring = false;
      for (const args of deferred.values()) show(args);
      deferred.clear();
    },
    retire: () => {
      retired = true;
      deferred.clear();
    },
  };
};
