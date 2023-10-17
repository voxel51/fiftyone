import LRUCache from "lru-cache";
import { ImaVidFrameSamples, PartitionSampleId } from "./types";

export const ImaVidStore = new LRUCache<PartitionSampleId, ImaVidFrameSamples>({
  max: 20,
  dispose: (_partitionSampleId, sampleFrames) => {
    sampleFrames.reset();
  },
});
