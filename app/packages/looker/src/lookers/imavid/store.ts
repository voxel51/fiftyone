import LRUCache from "lru-cache";
import { ImaVidFrameSamples, PartitionSampleId } from "./types";

/**
 * Each entry in the cache stores frames for ONE ordered dynamic group.
 */
export const ImaVidStore = new LRUCache<PartitionSampleId, ImaVidFrameSamples>({
  max: 20,
  dispose: (_partitionSampleId, sampleFrames) => {
    sampleFrames.reset();
  },
});
