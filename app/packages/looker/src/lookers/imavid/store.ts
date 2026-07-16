import { LRUCache } from "lru-cache";
import { ImaVidFramesController } from "./controller";
import { ImaVidSampleStore } from "./ima-vid-frame-samples";
import { PartitionId } from "./types";

export const ImaVidFramesControllerStore = new LRUCache<
  PartitionId,
  ImaVidFramesController
>({
  // must exceed the tiles a grid page can mount (~120 with lookahead) — a
  // controller itself is small (indexes + buffer managers; frames live in the
  // shared sample store), but evicting a VISIBLE tile's controller forces a
  // poster re-seed/re-fetch on every rotation. 200 matches the grid's looker
  // instance budget (MAX_INSTANCES)
  max: 200,
  dispose: (framesController) => {
    framesController.destroy();
  },
});

// controllers are keyed by bare sample `_id` but bake in the view/filters/fields
// they were built with, and the shared sample store holds frames fetched under
// them — a view/filter/media-field change must drop both or stale frames replay
export const resetImaVidStores = () => {
  ImaVidFramesControllerStore.clear();
  ImaVidSampleStore.clear();
};
