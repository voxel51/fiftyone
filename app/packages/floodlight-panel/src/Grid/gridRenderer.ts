import type { ID, Show } from "@fiftyone/floodlight";
import {
  type Ownership,
  type Renderer,
  type Scoped,
  scopeRenderer,
} from "../host/ownership";

type ShowArgs<V> = Parameters<Show<number, V>>[0];

export interface GridRendererOptions<V> {
  /** The renderer for the build's kind, read at call time. */
  base: () => Renderer<number, V>;
  /** Whether a looker for an item is cached. */
  cached: (key: string) => boolean;
  /** A visible instance still holds the lookers, so shows wait for the swap. */
  deferred: boolean;
  /** Built during a resize: move cached lookers at their last size. */
  interim: boolean;
  ownership: Ownership;
  /** Swimlane rows hold whole instances, so a resize never reattaches them. */
  reattach: boolean;
  shimmer: (args: ShowArgs<V>) => Promise<number>;
  /** The dimensions each item was last shown at, shared across builds. */
  sizes: Map<string, [number, number]>;
}

/**
 * The renderer one grid instance renders through. An interim build moves a
 * cached looker at its last size (no canvas reallocation) and shimmers the
 * rest; a content build shows at real size.
 */
export const createGridRenderer = <V>(
  options: GridRendererOptions<V>,
): Scoped<number, V> => {
  const { base, cached, interim, reattach, shimmer, sizes } = options;

  const showItem = (item: ShowArgs<V>) => {
    const key = item.id.description;
    if (!interim) {
      sizes.set(key, item.dimensions);
      return base().showItem(item);
    }
    const last = sizes.get(key);
    return last && reattach && cached(key)
      ? base().showItem({ ...item, dimensions: last })
      : shimmer(item);
  };

  const scoped = scopeRenderer<number, V>(
    {
      detachItem: (id: ID) => base().detachItem(id),
      hideItem: (args) => base().hideItem(args),
      showItem,
    },
    options.ownership,
  );
  options.deferred && scoped.defer();
  return scoped;
};
