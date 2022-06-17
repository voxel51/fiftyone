import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import LRUCache from "lru-cache";

import { SampleData } from "../../recoil/atoms";

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

export default <T extends Lookers>(): LookerStore<T> => {
  const indices = new Map<number, string>();
  const lookers = createLookerCache<T>();
  const samples = new Map<string, SampleData>();

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
