import { useTiling } from "@fiftyone/tiling";
import { useCallback } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import { useMcapImageTileBindings } from "./mcap-tile-source-bindings";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";
import { getMcapTileDefinition } from "./use-mcap-tiles";

/**
 * Opens the modal's view of an image stream: focuses the tile already
 * showing it, or spawns a new image tile bound to it. Shared by every
 * "take me to this camera" affordance — the source-first add-tile menu
 * and the clickable 3D frustums.
 */
export function useOpenMcapImageTile(): (sourceId: string) => void {
  const { addTile, setFocusedTileId } = useTiling();
  const sources = useSceneInventory();
  const bindings = useMcapImageTileBindings();

  return useCallback(
    (sourceId: string) => {
      if (!sourceId) return;
      const boundTileId = Object.keys(bindings).find(
        (tileId) => bindings[tileId] === sourceId,
      );
      if (boundTileId) {
        setFocusedTileId(boundTileId);
        return;
      }
      const definition = getMcapTileDefinition(MCAP_TILE_TYPE.IMAGE);
      if (!definition) return;
      const Tile = definition.Tile;
      const title =
        sources.find((source) => source.id === sourceId)?.label ?? sourceId;
      addTile(
        {
          render: () => <Tile initialSourceId={sourceId} />,
          title,
          type: MCAP_TILE_TYPE.IMAGE,
        },
        { idPrefix: MCAP_TILE_TYPE.IMAGE },
      );
    },
    [addTile, bindings, setFocusedTileId, sources],
  );
}
