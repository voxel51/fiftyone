/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * How a stack layer holds its looker so the expanded grid can take it over
 * and give it back without recreating it, and without resizing it while
 * it flies: a moving show reattaches at the looker's last size (it
 * stretches to the new box), and the show after the flight resizes once.
 */

import type Spotlight from "@fiftyone/floodlight";
import type { ID } from "@fiftyone/floodlight";
import {
  type Ownership,
  type Renderer,
  type Scoped,
  scopeRenderer,
} from "../../host/ownership";

// A layer has no instance; the renderer only reports size changes to it.
const NO_INSTANCE = {
  sizeChange: () => undefined,
} as unknown as Spotlight<number, never>;

export interface Sizing {
  /** The dimensions each item was last shown at a real size. */
  sizes: Map<string, [number, number]>;
  /** Whether the cache holds a looker for the item. */
  has: (key: string) => boolean;
  /** Marks a tile waiting for a looker the flight does not create. */
  shimmer: (element: HTMLDivElement) => void;
}

/**
 * Real shows record their size. A moving show (a flight or a resize in
 * progress) reattaches a cached looker at its last size and shimmers the
 * rest, so it neither resizes nor creates lookers.
 */
export const sizedRenderer = <V>(
  renderer: Renderer<number, V>,
  { has, shimmer, sizes }: Sizing,
  moving: boolean,
): Renderer<number, V> => ({
  ...renderer,
  showItem: (item) => {
    const key = item.id.description;
    if (!moving) {
      sizes.set(key, item.dimensions);
      return renderer.showItem(item);
    }
    const last = sizes.get(key);
    if (last && has(key)) {
      return renderer.showItem({ ...item, dimensions: last });
    }
    shimmer(item.element);
    return Promise.resolve(0);
  },
});

/**
 * A scoped renderer whose first show of an item takes it from whoever
 * showed it last: the cache's "shown" mark is cleared so `showItem`
 * reattaches the cached looker here instead of returning early. The take
 * happens when the show is performed, so a deferred show takes at `flush`.
 */
export const takeoverRenderer = <V>(
  renderer: Renderer<number, V>,
  group: Ownership,
): Scoped<number, V> => {
  const mine = new Set<string>();
  const scoped = scopeRenderer<number, V>(
    {
      ...renderer,
      showItem: (args) => {
        const key = args.id.description;
        if (!mine.has(key)) {
          renderer.hideItem({ id: args.id });
          mine.add(key);
        }
        return renderer.showItem(args);
      },
    },
    group,
  );

  return {
    ...scoped,
    hideItem: (args) => {
      mine.delete(args.id.description);
      scoped.hideItem(args);
    },
    detachItem: (id) => {
      mine.delete(id.description);
      scoped.detachItem(id);
    },
  };
};

/**
 * One layer's hold on an item. `suspend` clears the cache's "shown" mark
 * but leaves the looker in place for the grid to take; `release` detaches
 * only what this layer still owns.
 */
export const createLayerSlot = <V>(
  renderer: Renderer<number, V>,
  group: Ownership,
  sizing?: Sizing,
) => {
  const real = takeoverRenderer(
    sizing ? sizedRenderer(renderer, sizing, false) : renderer,
    group,
  );
  const moving = sizing
    ? takeoverRenderer(sizedRenderer(renderer, sizing, true), group)
    : real;
  let held: { id: ID; by: Scoped<number, V> } | undefined;

  return {
    /**
     * Resolves `true` once a looker is attached and loaded, or `false` for
     * a moving show that shimmers instead of creating one.
     */
    show(
      id: ID,
      element: HTMLDivElement,
      dimensions: [number, number],
      flying = false,
    ) {
      const by = flying ? moving : real;
      held = { by, id };
      const cached =
        !flying ||
        !sizing ||
        (sizing.sizes.has(id.description) && sizing.has(id.description));
      return by
        .showItem({
          dimensions,
          element,
          id,
          spotlight: NO_INSTANCE as unknown as Spotlight<number, V>,
          zooming: false,
        })
        .then(() => cached);
    },
    suspend() {
      held?.by.hideItem({ id: held.id });
      held = undefined;
    },
    release(id: ID) {
      real.detachItem(id);
      moving.detachItem(id);
    },
  };
};

export type LayerSlot = ReturnType<typeof createLayerSlot>;
