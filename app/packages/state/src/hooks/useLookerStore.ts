import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import LRUCache from "lru-cache";
import { useState } from "react";

import { SampleData } from "../recoil/atoms";

export type Lookers = FrameLooker | ImageLooker | VideoLooker;

const createLookerCache = <T extends Lookers>() => {
  return new LRUCache<string, T>({
    max: 500,
    dispose: (id, looker) => looker.destroy(),
  });
};

export interface LookerStore<T extends Lookers> {
  indices: Map<number, string>;
  lookers: LRUCache<string, T>;
  samples: Map<string, SampleData>;
  reset: () => void;
}

const stores = new Set<{
  samples: Map<string, SampleData>;
  lookers: LRUCache<string, Lookers>;
}>();

export const updateSample = (id: string, sample: SampleData) =>
  stores.forEach((store) => {
    if (store.samples.get(id)) {
      store.samples.set(id, sample);
      store.lookers.get(id)?.updateSample(sample.sample);
    }
  });

export const getSample = (id: string): SampleData | undefined => {
  for (const { samples: store } of stores.keys()) {
    const sample = store.get(id);
    if (sample) {
      return sample;
    }
  }

  return undefined;
};

const create = <T extends Lookers>(): LookerStore<T> => {
  const indices = new Map<number, string>();
  const samples = new Map<string, SampleData>();
  const lookers = createLookerCache<T>();
  stores.add({ samples, lookers });

  return {
    samples,
    indices,
    lookers,
    reset: () => {
      lookers.reset();
      samples.clear();
      indices.clear();
    },
  };
};

export default () => {
  const [store] = useState(() => create());
  return store;
};
