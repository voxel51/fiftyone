import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import LRUCache from "lru-cache";

import { SampleData } from "../recoil/atoms";

type Lookers = FrameLooker | ImageLooker | VideoLooker;

const createLookerCache = <L extends Lookers>() => {
  return new LRUCache<string, L>({
    max: 500,
    dispose: (id, looker) => looker.destroy(),
  });
};

export const store = (() => {
  const samples = new Map<string, SampleData>();
  const indices = new Map<number, string>();
  const lookers = createLookerCache();

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
})();
