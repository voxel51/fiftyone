import { createCache } from "@fiftyone/looker/src/cache";
import type { Renderer } from "../host/ownership";

class FakeLooker extends EventTarget {
  readonly loaded = true;
  dimensions?: [number, number];
  element?: HTMLElement;
  attach(element: HTMLElement, dimensions: [number, number]) {
    this.element = element;
    this.dimensions = dimensions;
  }
  detach() {
    this.element = undefined;
  }
  destroy() {
    this.element = undefined;
  }
  getSizeBytesEstimate() {
    return 1;
  }
}

export interface CacheCounts {
  creates: number;
  /** Attaches of a looker the cache already held. */
  reattaches: number;
  /** Attaches at dimensions other than the looker's last ones. */
  resizes: number;
  /** Shows that returned early at `isShown` into a different element. */
  skipped: number;
}

const zero = (): CacheCounts => ({
  creates: 0,
  reattaches: 0,
  resizes: 0,
  skipped: 0,
});

/**
 * The grid's renderer (`Grid/useRenderer.ts`) over the real looker cache,
 * with fake lookers. It keeps the grid's `isShown` early return so a
 * handoff behaves as it does in the app; builds call `cache.freeze()`.
 */
export const createCacheRenderer = <K, V>() => {
  const cache = createCache<FakeLooker>({
    maxHiddenItems: 10_000,
    maxHiddenItemsSizeBytes: 1e12,
  });
  const counts = new Map<string, CacheCounts>();
  // per instance: the element each displayed item was last shown into
  const requested = new Map<string, Map<string, HTMLElement>>();

  const forInstance = (label: string): Renderer<K, V> => {
    const tiles = new Map<string, HTMLElement>();
    const count = zero();
    requested.set(label, tiles);
    counts.set(label, count);

    return {
      showItem: ({ id: { description: key }, element, dimensions }) => {
        tiles.set(key, element);
        const looker = cache.get(key);
        if (cache.isShown(key)) {
          looker?.element !== element && count.skipped++;
          return Promise.resolve(1);
        }
        if (looker) {
          const [width, height] = looker.dimensions ?? [];
          if (width !== dimensions[0] || height !== dimensions[1]) {
            count.resizes++;
          }
          count.reattaches++;
          looker.attach(element, dimensions);
          cache.show(key);
          return Promise.resolve(1);
        }
        const created = new FakeLooker();
        count.creates++;
        cache.set(key, created);
        created.attach(element, dimensions);
        return Promise.resolve(1);
      },
      hideItem: ({ id }) => {
        tiles.delete(id.description);
        cache.hide(id.description);
      },
      detachItem: (id) => {
        tiles.delete(id.description);
        cache.get(id.description)?.detach();
        cache.hide(id.description);
      },
    };
  };

  return {
    cache,
    for: forInstance,
    counts: (label: string) => counts.get(label) ?? zero(),
    /** Tiles an instance displays whose looker is somewhere else. */
    blank: (label: string) =>
      [...(requested.get(label) ?? [])]
        .filter(([key, element]) => cache.get(key)?.element !== element)
        .map(([key]) => key),
    /** Tiles an instance currently displays. */
    tiles: (label: string) => [...(requested.get(label)?.keys() ?? [])],
  };
};
