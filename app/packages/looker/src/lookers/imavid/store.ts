import LRUCache from "lru-cache";
import { ImaVidFramesController } from "./controller";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";
import { PartitionId } from "./types";

/**
 * Each entry in the cache stores frames for ONE ordered dynamic group.
 */
export const ImaVidStore = new LRUCache<PartitionId, ImaVidFrameSamples>({
  max: 20,
  dispose: (_partitionId, sampleFrames) => {
    sampleFrames.reset();
  },
});

export const ImaVidFramesControllerStore = new LRUCache<
  PartitionId,
  ImaVidFramesController
>({
  max: 20,
  dispose: (_partitionId, framesController) => {
    framesController.destroy();
  },
});
