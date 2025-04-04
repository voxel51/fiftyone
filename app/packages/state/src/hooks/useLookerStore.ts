import type { Lookers } from "@fiftyone/looker";
import { LRUCache } from "lru-cache";
import { useState } from "react";
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

export const stores = new Set<{
  samples: Map<string, ModalSample>;
  lookers: LRUCache<string, Lookers>;
}>();

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
