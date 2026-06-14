import type { Lookers } from "@fiftyone/looker";
import { LRUCache } from "lru-cache";
import { useEffect, useState } from "react";
import type { ModalSample } from "../recoil";

export type { Lookers };

// A looker holds GPU/canvas resources for the sample it renders, so the cache
// is bounded and evicted lookers are destroyed rather than leaked.
const createLookerCache = <T extends Lookers>() => {
  return new LRUCache<string, T>({
    max: 500,
    dispose: (looker) => looker.destroy(),
  });
};

/**
 * One view's local cache of the samples it shows, keyed by sample id:
 *
 * - `samples` is the sample *data* (the source of truth a view renders from).
 * - `lookers` is the *renderers* — a looker is the imperative engine that
 *   paints one sample's media and label overlays onto a canvas. Not every
 *   cached sample has a live looker (lookers are created lazily and evicted),
 *   so the two maps share keys but `lookers` is a bounded subset.
 * - `indices` maps a grid/carousel position to the sample id at it.
 */
export interface LookerStore<T extends Lookers> {
  indices: Map<number, string>;
  lookers: LRUCache<string, T>;
  samples: Map<string, ModalSample>;
  reset: () => void;
}

/**
 * The seam that lets a single client-side sample edit reach every view
 * currently showing that sample. Each view (the modal store, the grid cache)
 * is its own `LookerStore` with its own caches, so without this they couldn't
 * see each other's updates. Each registers a {@link SampleStore}; one
 * `useUpdateSamples` write then fans out to all of them, repainting just the
 * affected sample in place instead of forcing a full grid reload.
 */
export interface SampleStore {
  updateSample: (id: string, sample: ModalSample["sample"]) => void;
}

export const stores = new Set<SampleStore>();

export const registerSampleStore = (store: SampleStore): (() => void) => {
  stores.add(store);
  return () => {
    stores.delete(store);
  };
};

/** {@link registerSampleStore}, scoped to the calling component's lifetime. */
export const useRegisterSampleStore = (store: SampleStore): void => {
  useEffect(() => registerSampleStore(store), [store]);
};

const create = <T extends Lookers>(): LookerStore<T> => {
  const indices = new Map<number, string>();
  const samples = new Map<string, ModalSample>();
  const lookers = createLookerCache<T>();

  // Keep this view in sync with edits made elsewhere: update the cached sample
  // data and, if a looker is live for it, hand it the new sample to repaint.
  // Samples this view doesn't hold are ignored.
  registerSampleStore({
    updateSample: (id, sample) => {
      const record = samples.get(id);
      if (!record) {
        return;
      }
      samples.set(id, { ...record, sample });
      // @ts-ignore
      lookers.get(id)?.updateSample(sample);
    },
  });

  return {
    samples,
    indices,
    lookers,
    reset: () => {
      lookers.clear();
      samples.clear();
      indices.clear();
    },
  };
};

export default () => {
  const [store] = useState(() => create());
  return store;
};
