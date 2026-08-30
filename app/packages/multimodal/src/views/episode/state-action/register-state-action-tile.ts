import { IconName } from "@voxel51/voodo";
import {
  getEpisodeTileExtension,
  registerEpisodeTileExtension,
} from "../../../extensions/tiles/registry";
import StateActionTile from "./StateActionTile";

/** Namespaced tile id persisted layouts reference for this extension. */
const STATE_ACTION_TILE_ID = "lerobot:state-action";

// Module side effect of the lazy LeRobot client chunk: the chunk loads
// before the adapter can open a session, and the tile only becomes
// available once a session exposes hasStateAction, so the registry always
// holds this definition before the catalog can offer it. The existence
// guard keeps duplicate module evaluations (HMR, tests) harmless.
if (!getEpisodeTileExtension(STATE_ACTION_TILE_ID)) {
  registerEpisodeTileExtension({
    icon: IconName.Sliders,
    id: STATE_ACTION_TILE_ID,
    isAvailable: ({ hasStateAction }) => hasStateAction,
    order: 58,
    Tile: StateActionTile,
    typeLabel: "State & Action",
  });
}
