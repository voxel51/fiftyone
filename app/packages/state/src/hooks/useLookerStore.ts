import type { Lookers } from "@fiftyone/looker";
import { LRUCache } from "lru-cache";
import { useEffect, useState } from "react";
import type { ModalSample } from "../recoil";

export type { Lookers };

const createLookerCache = <T extends Lookers>() => {
  return new LRUCache<string, T>({
    max: 500,
    dispose: (looker) => looker.destroy(),
  });
};

export interface LookerStore<T extends Lookers> {
  indices: Map<number, string>;
  lookers: LRUCache<string, T>;
  samples: Map<string, ModalSample>;
  reset: () => void;
}

/**
 * A registered target for in-place sample updates. Each looker-holding view —
 * the modal store and the grid cache — registers one via
 * {@link registerSampleStore}, so a single `useUpdateSamples` call repaints
 * that sample's tile in every view without a full grid refresh.
 */
export interface SampleStore {
  updateSample: (id: string, sample: ModalSample["sample"]) => void;
}

export const stores = new Set<SampleStore>();

/**
 * Register a sample-update target. Returns a function that unregisters it.
 */
export const registerSampleStore = (store: SampleStore): (() => void) => {
  stores.add(store);
  return () => {
    stores.delete(store);
  };
};

/**
 * {@link registerSampleStore}, scoped to the calling component's lifetime.
 */
export const useRegisterSampleStore = (store: SampleStore): void => {
  useEffect(() => registerSampleStore(store), [store]);
};

const create = <T extends Lookers>(): LookerStore<T> => {
  const indices = new Map<number, string>();
  const samples = new Map<string, ModalSample>();
  const lookers = createLookerCache<T>();

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
