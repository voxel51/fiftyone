import type { Hide, ID, Show } from "@fiftyone/floodlight";

/** The item callbacks a Floodlight instance renders through. */
export interface Renderer<K, V> {
  detachItem: (id: ID) => void;
  hideItem: Hide;
  showItem: Show<K, V>;
}

// one owner map per group of instances sharing an item cache
const owners = new WeakMap<object, Map<string, symbol>>();

/**
 * Scopes a shared renderer to one instance: the instance that showed an item
 * last owns it, and only the owner may hide or detach it. Without this, an
 * instance torn down after another took over its items would pull them out
 * of the new instance's tiles.
 */
export const scopeRenderer = <K, V>(
  renderer: Renderer<K, V>,
  /** Any object shared by exactly the instances that share the item cache. */
  group: object,
): Renderer<K, V> => {
  let map = owners.get(group);
  if (!map) {
    map = new Map();
    owners.set(group, map);
  }
  const shared = map;
  const scope = Symbol("instance");
  const owns = (id: ID) => shared.get(id.description) === scope;

  return {
    showItem: (args) => {
      shared.set(args.id.description, scope);
      return renderer.showItem(args);
    },
    hideItem: (args) => {
      if (owns(args.id)) renderer.hideItem(args);
    },
    detachItem: (id) => {
      if (!owns(id)) return;
      shared.delete(id.description);
      renderer.detachItem(id);
    },
  };
};
