import {
  FrameLooker,
  ImageLooker,
  ImaVidLooker,
  VideoLooker,
} from "@fiftyone/looker";
import { LRUCache } from "lru-cache";
import { useState } from "react";
import { ModalSample } from "../recoil";

export type Lookers = FrameLooker | ImageLooker | ImaVidLooker | VideoLooker;

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

export const stores = new Set<{
  samples: Map<string, ModalSample>;
  lookers: LRUCache<string, Lookers>;
}>();

export const getSample = (id: string): ModalSample | undefined => {
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
  const samples = new Map<string, ModalSample>();
  const lookers = createLookerCache<T>();
  stores.add({ samples, lookers });

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
