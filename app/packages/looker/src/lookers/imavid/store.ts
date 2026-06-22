import { LRUCache } from "lru-cache";
import { ImaVidFramesController } from "./controller";
import { PartitionId } from "./types";

export const ImaVidFramesControllerStore = new LRUCache<
  PartitionId,
  ImaVidFramesController
>({
  max: 20,
  dispose: (framesController) => {
    framesController.destroy();
  },
});
